import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';

const DIFY_API_URL = 'https://dify.aix101.com/v1';
const DIFY_API_KEY = 'app-HE8suS9tjzSXrHi5WrpbUlNM';
const DIFY_WORKFLOW_API_KEY = 'app-1nPefb4z4E7l4oGDQjdp5dbd';

const REPORT_KEY_PREFIX = 'report:';
const SUMMARY_KEY_PREFIX = 'summary:';
const LEGACY_MASTER_KEY = 'all_v2';
const DIFY_TIMEOUT_MS = 120000;
const DIFY_RETRY_COUNT = 2;

function getReportsStore() {
  return getStore('analysis-reports');
}

function getSummariesStore() {
  return getStore('class-summaries');
}

function getReportKey(id: string) {
  return `${REPORT_KEY_PREFIX}${id}`;
}

function getSummaryKey(agentId: string) {
  return `${SUMMARY_KEY_PREFIX}${agentId}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseBlobValue(rawData: any) {
  if (!rawData) return null;
  if (typeof rawData === 'string') {
    try {
      return JSON.parse(rawData);
    } catch {
      return rawData;
    }
  }
  return rawData;
}

async function readLegacyMap(store: ReturnType<typeof getStore>) {
  const rawData = await store.get(LEGACY_MASTER_KEY);
  const parsed = await parseBlobValue(rawData);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

async function getReportsData(): Promise<Record<string, any>> {
  try {
    const store = getReportsStore();
    const reports: Record<string, any> = {};
    const { blobs } = await store.list({ prefix: REPORT_KEY_PREFIX });

    for (const blob of blobs) {
      const parsed = await parseBlobValue(await store.get(blob.key));
      if (!parsed) continue;

      const conversationId = parsed?.conversationId || blob.key.slice(REPORT_KEY_PREFIX.length);
      if (conversationId) reports[conversationId] = parsed;
    }

    if (Object.keys(reports).length > 0) return reports;
    return await readLegacyMap(store);
  } catch (e) {
    console.error('Failed to get reports from blob:', e);
    return {};
  }
}

async function saveReportToBlob(id: string, report: any) {
  try {
    await getReportsStore().set(getReportKey(id), JSON.stringify(report));
  } catch (e) {
    console.error('Failed to save report to blob:', e);
  }
}

async function getAllReportsFromBlob() {
  return getReportsData();
}

async function getReportFromBlob(id: string) {
  try {
    const store = getReportsStore();
    const parsed = await parseBlobValue(await store.get(getReportKey(id)));
    if (parsed) return parsed;

    const reports = await getReportsData();
    return reports[id] || null;
  } catch (e) {
    console.error(`Failed to get report ${id} from blob:`, e);
    return null;
  }
}

async function getSummariesData(): Promise<Record<string, any>> {
  try {
    const store = getSummariesStore();
    const summaries: Record<string, any> = {};
    const { blobs } = await store.list({ prefix: SUMMARY_KEY_PREFIX });

    for (const blob of blobs) {
      const parsed = await parseBlobValue(await store.get(blob.key));
      if (parsed == null) continue;
      summaries[blob.key.slice(SUMMARY_KEY_PREFIX.length)] = parsed;
    }

    if (Object.keys(summaries).length > 0) return summaries;
    return await readLegacyMap(store);
  } catch (e) {
    console.error('Failed to get summaries from blob:', e);
    return {};
  }
}

async function saveClassSummaryToBlob(agentId: string, summary: string) {
  try {
    await getSummariesStore().set(getSummaryKey(agentId), summary);
  } catch (e) {
    console.error('Failed to save class summary to blob:', e);
  }
}

async function getAllClassSummariesFromBlob() {
  return getSummariesData();
}

async function fetchDify(path: string, apiKey: string, payload: unknown, label: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= DIFY_RETRY_COUNT; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DIFY_TIMEOUT_MS);

    try {
      const response = await fetch(`${DIFY_API_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        return response.json();
      }

      const errorText = await response.text();
      const message = `${label} failed with ${response.status}: ${errorText.slice(0, 300)}`;
      if (response.status >= 500 && attempt < DIFY_RETRY_COUNT) {
        lastError = new Error(message);
        await sleep(1000 * (attempt + 1));
        continue;
      }

      throw new Error(message);
    } catch (error: any) {
      clearTimeout(timeout);
      lastError = error;
      const isRetryable = error?.name === 'AbortError' || /fetch failed|ECONNRESET|ETIMEDOUT|socket|network/i.test(String(error?.message || ''));
      if (isRetryable && attempt < DIFY_RETRY_COUNT) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'getReport') {
      const conversationId = searchParams.get('conversationId');
      if (!conversationId) {
        return NextResponse.json({ error: '缺少 conversationId' }, { status: 400 });
      }

      const report = await getReportFromBlob(conversationId);
      if (!report) {
        return NextResponse.json({ error: '未找到分析报告' }, { status: 404 });
      }

      return NextResponse.json({ report });
    }

    if (action === 'getAllData') {
      return NextResponse.json({
        reports: await getAllReportsFromBlob(),
        summaries: await getAllClassSummariesFromBlob(),
      });
    }

    return NextResponse.json({ error: '无效的 GET 请求' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function getStructuredScores(conversationText: string) {
  const queryText = `请分析以下学生对话并生成元认知评价报告。请务必直接返回一个 JSON 对象，不要包含 Markdown 代码块标记，结构如下：{
  "metacognitive": {
    "PL": 数量,
    "MO": 数量,
    "RE": 数量,
    "EV": 数量,
    "regulationRatio": 0-1之间的比例
  },
  "srlPhases": {
    "planning": 0-100的百分比数值,
    "monitoring": 0-100的百分比数值,
    "regulation": 0-100的百分比数值
  },
  "evaluation": {
    "overallScore": 0-10,
    "questionQuality": 0-10,
    "evidenceUsage": 0-10,
    "logicalReasoning": 0-10,
    "selfReflection": 0-10
  },
  "detailedCodes": [
    { "code": "PL/MO/RE/EV", "text": "对应的学生原文", "description": "编码理由" }
  ],
  "summary": "综合评语",
  "suggestions": ["针对性的改进建议1", "建议2", "建议3"]
}

待分析对话内容：
${conversationText}`;

  const difyData = await fetchDify(
    '/chat-messages',
    DIFY_API_KEY,
    {
      inputs: { conversation: conversationText },
      query: queryText,
      user: 'teacher-analysis-system',
      response_mode: 'blocking',
    },
    'DIFY score request'
  );

  const content = difyData.answer || difyData.data?.outputs?.text || '';
  const jsonMatch = content.match(/(\{[\s\S]*\})/);
  const jsonContent = jsonMatch ? jsonMatch[1] : content;
  return JSON.parse(jsonContent.trim());
}

async function generateMarkdownReport(
  conversationText: string,
  analysisResult: any,
  bigComment: string,
  studentName: string
) {
  const detailedQuery = `请针对学生【${studentName || '该学生'}】的探究学习表现，根据以下数据生成一份详细的元认知 Markdown 分析报告。

评分数据：${JSON.stringify(analysisResult.evaluation)}

元认知统计：${JSON.stringify(analysisResult.metacognitive)}

综合摘要：${analysisResult.summary}

完整对话记录：${conversationText}`;

  const difyData = await fetchDify(
    '/chat-messages',
    DIFY_WORKFLOW_API_KEY,
    {
      inputs: {
        conversation: conversationText,
        scores: JSON.stringify(analysisResult.evaluation),
        metacognitive: JSON.stringify(analysisResult.metacognitive),
        summary: analysisResult.summary,
        agent: bigComment || 'SRL-test',
      },
      query: detailedQuery,
      user: 'teacher-analysis-system',
      response_mode: 'blocking',
    },
    'DIFY report request'
  );

  return difyData.answer || difyData.data?.outputs?.text || '';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, conversationId, messages, studentName, bigComment, previousResult, classData, className } = body;

    if (action === 'getClassSummary') {
      if (!classData) {
        return NextResponse.json({ error: '缺少全班数据' }, { status: 400 });
      }

      const detailedQuery = `请针对【${className || '全班'}】的整体探究学习表现，生成汇总报告。

数据：
${classData}`;

      const difyData = await fetchDify(
        '/chat-messages',
        DIFY_WORKFLOW_API_KEY,
        {
          inputs: { agent: bigComment || 'SRL-test', type: 'class-summary' },
          query: detailedQuery,
          user: 'teacher-analysis-system',
          response_mode: 'blocking',
        },
        'DIFY class summary request'
      );

      const markdownReport = difyData.answer || difyData.data?.outputs?.text || '';
      await saveClassSummaryToBlob(bigComment || 'SRL-test', markdownReport);
      return NextResponse.json({ markdownReport });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: '没有对话内容' }, { status: 400 });
    }

    const conversationText = messages
      .map((m: any) => `${m.role === 'user' ? '学生' : 'AI助手'}：${m.content}`)
      .join('\n\n');

    if (action === 'getScore') {
      const result = await getStructuredScores(conversationText);
      const fullResult = {
        conversationId,
        studentName: studentName || '学生',
        analysisTime: Date.now(),
        ...result,
      };
      await saveReportToBlob(conversationId, fullResult);
      return NextResponse.json(fullResult);
    }

    if (action === 'getReport') {
      if (!previousResult) {
        return NextResponse.json({ error: '缺少评分结果' }, { status: 400 });
      }

      const markdownReport = await generateMarkdownReport(
        conversationText,
        previousResult,
        bigComment,
        studentName
      );
      const finalResult = { ...previousResult, markdownReport };
      await saveReportToBlob(conversationId, finalResult);
      return NextResponse.json({ markdownReport });
    }

    return NextResponse.json({ error: '无效请求' }, { status: 400 });
  } catch (error: any) {
    const message = error?.name === 'AbortError'
      ? '分析服务请求超时，请稍后重试'
      : error?.message || '分析服务异常';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
