import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';

export const dynamic = 'force-dynamic';

const DEFAULT_AGENTS = [
  { id: 'SRL-tj1-test', name: '探究1：流域协调发展' },
  { id: 'SRL-tj2-test', name: '探究2：南水北调探究活动' },
  { id: 'SRL-test', name: '探究3：产业转移的影响因素' },
];

type AgentItem = { id: string; name: string };

function getAgentsStore() {
  return getStore('agents');
}

async function readAgents(): Promise<AgentItem[]> {
  // 1. 尝试从 Blob 读取
  try {
    const store = getAgentsStore();
    const rawData: any = await store.get('default');
    
    // 如果是合法数组直接返回
    if (Array.isArray(rawData) && rawData.length > 0) {
      console.log('✅ [Agents] Loaded from Blobs');
      return rawData;
    }
    
    // 如果是字符串（本地或写入时的序列化数据），尝试解析
    if (typeof rawData === 'string') {
      try {
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log('✅ [Agents] Loaded and parsed from Blobs');
          return parsed;
        }
      } catch (e) {
        console.warn('⚠️ [Agents] Failed to parse string from Blobs, falling back to default');
      }
    }
  } catch (err: any) {
    if (!err.message?.includes('MissingBlobsEnvironmentError')) {
      console.error('❌ [Agents] Read error:', err.message);
    }
  }

  return DEFAULT_AGENTS;
}

async function writeAgents(agents: AgentItem[]) {
  // 1. 尝试写入 Blob
  try {
    const store = getAgentsStore();
    // 强制转换为 JSON 字符串，防止隐式转换为 "[object Object]"
    await store.set('default', JSON.stringify(agents));
    console.log('💾 [Agents] Saved to Blobs');
    return true;
  } catch (err: any) {
    console.error('❌ [Agents] Write error:', err.message);
    return false;
  }
}




export async function GET() {
  const agents = await readAgents();
  return NextResponse.json(agents);
}

export async function POST(request: NextRequest) {
  try {
    const agents = await request.json();
    if (await writeAgents(agents)) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: false, error: '写入存储失败' }, { status: 500 });
  } catch {
    return NextResponse.json({ success: false, error: '无效的数据格式' }, { status: 400 });
  }
}
