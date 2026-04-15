import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';

// DIFY API配置
const DIFY_API_URL = 'https://dify.aix101.com/v1';
const DIFY_API_KEY = 'app-HE8suS9tjzSXrHi5WrpbUlNM';
const DIFY_WORKFLOW_API_KEY = 'app-1nPefb4z4E7l4oGDQjdp5dbd';

function getReportsStore() {
  return getStore('analysis-reports');
}

function getSummariesStore() {
  return getStore('class-summaries');
}

async function getReportsData(): Promise<Record<string, any>> {
  try {
    const store = getReportsStore();
    const rawData: any = await store.get('all_v2');
    if (!rawData) return {};
    if (typeof rawData === 'string') {
      try { return JSON.parse(rawData); } catch(e) { return {}; }
    }
    return rawData;
  } catch (e) {
    console.error('Failed to get reports from blob:', e);
    return {};
  }
}

async function saveReportToBlob(id: string, report: any) {
  try {
    const reports = await getReportsData();
    reports[id] = report;
    await getReportsStore().set('all_v2', JSON.stringify(reports));
    console.log(`💾 [Analyze] Report for ${id} saved to master Blob`);
  } catch (e) {
    console.error('Failed to save report to blob:', e);
  }
}

async function getAllReportsFromBlob() {
  return await getReportsData();
}

async function getSummariesData(): Promise<Record<string, any>> {
  try {
    const store = getSummariesStore();
    const rawData: any = await store.get('all_v2');
    if (!rawData) return {};
    if (typeof rawData === 'string') {
      try { return JSON.parse(rawData); } catch(e) { return {}; }
    }
    return rawData;
  } catch (e) {
    console.error('Failed to get summaries from blob:', e);
    return {};
  }
}

async function saveClassSummaryToBlob(agentId: string, summary: string) {
  try {
    const summaries = await getSummariesData();
    summaries[agentId] = summary;
    await getSummariesStore().set('all_v2', JSON.stringify(summaries));
    console.log(`💾 [Analyze] Class summary for ${agentId} saved to master Blob`);
  } catch (e) {
    console.error('Failed to save class summary to blob:', e);
  }
}

async function getAllClassSummariesFromBlob() {
  return await getSummariesData();
}





export const maxDuration = 300; 
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'getAllData') {
      return NextResponse.json({
        reports: await getAllReportsFromBlob(),
        summaries: await getAllClassSummariesFromBlob()
      });
    }

    return NextResponse.json({ error: '无效的 GET 请求' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function getStructuredScores(conversationText: string) {
  const queryText = `请分析以下学生对话并生成元认知评价报告。
请务必直接返回一个 JSON 对象，不要包含 Markdown 代码块标签，结构如下：
{
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

  const response = await fetch(`${DIFY_API_URL}/chat-messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DIFY_API_KEY}`,
    },
    body: JSON.stringify({
      inputs: { conversation: conversationText },
      query: queryText,
      user: 'teacher-analysis-system',
      response_mode: 'blocking',
    }),
  });

  if (!response.ok) {
    throw new Error(`DIFY Score API 失败: ${response.status}`);
  }

  const difyData = await response.json();
  let content = difyData.answer || (difyData.data?.outputs?.text) || '';
  const jsonMatch = content.match(/(\{[\s\S]*\})/);
  let jsonContent = jsonMatch ? jsonMatch[1] : content;
  return JSON.parse(jsonContent.trim());
}

async function generateMarkdownReport(conversationText: string, analysisResult: any, bigComment: string, studentName: string) {
  const detailedQuery = `请针对学生【${studentName || '该学生'}】的探究学习表现，根据以下数据生成一份详细的元认知 Markdown 分析报告。\n\n评分数据：${JSON.stringify(analysisResult.evaluation)}\n\n元认知统计：${JSON.stringify(analysisResult.metacognitive)}\n\n综合摘录：${analysisResult.summary}\n\n完整对话记录：${conversationText}`;

  const response = await fetch(`${DIFY_API_URL}/chat-messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DIFY_WORKFLOW_API_KEY}`,
    },
    body: JSON.stringify({
      inputs: {
        conversation: conversationText,
        scores: JSON.stringify(analysisResult.evaluation),
        metacognitive: JSON.stringify(analysisResult.metacognitive),
        summary: analysisResult.summary,
        agent: bigComment || 'SRL-test'
      },
      query: detailedQuery,
      user: 'teacher-analysis-system',
      response_mode: 'blocking',
    }),
  });

  if (!response.ok) throw new Error('DIFY Report API 失败');
  const difyData = await response.json();
  return difyData.answer || (difyData.data?.outputs?.text) || '';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, conversationId, messages, studentName, bigComment, previousResult, classData, className } = body;

    if (action === 'getClassSummary') {
      if (!classData) return NextResponse.json({ error: '缺少全班数据' }, { status: 400 });
      const detailedQuery = `请针对【${className || '全班'}】的整体探究学习表现，生成汇总报告。\n\n数据：${classData}`;
      const response = await fetch(`${DIFY_API_URL}/chat-messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DIFY_WORKFLOW_API_KEY}`,
        },
        body: JSON.stringify({
          inputs: { agent: bigComment || 'SRL-test', type: 'class-summary' },
          query: detailedQuery,
          user: 'teacher-analysis-system',
          response_mode: 'blocking',
        }),
      });
      if (!response.ok) throw new Error('DIFY Class Summary API 失败');
      const difyData = await response.json();
      const markdownReport = difyData.answer || (difyData.data?.outputs?.text) || '';
      await saveClassSummaryToBlob(bigComment || 'SRL-test', markdownReport);
      return NextResponse.json({ markdownReport });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: '没有对话内容' }, { status: 400 });
    }

    const conversationText = messages.map((m: any) => `${m.role === 'user' ? '学生' : 'AI助手'}：${m.content}`).join('\n\n');

    if (action === 'getScore') {
      const result = await getStructuredScores(conversationText);
      const fullResult = { conversationId, studentName: studentName || '学生', analysisTime: Date.now(), ...result };
      await saveReportToBlob(conversationId, fullResult);
      return NextResponse.json(fullResult);
    } 
    
    if (action === 'getReport') {
      if (!previousResult) return NextResponse.json({ error: '缺少评分结果' }, { status: 400 });
      const markdownReport = await generateMarkdownReport(conversationText, previousResult, bigComment, studentName);
      const finalResult = { ...previousResult, markdownReport };
      await saveReportToBlob(conversationId, finalResult);
      return NextResponse.json({ markdownReport });
    }

    return NextResponse.json({ error: '无效请求' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
