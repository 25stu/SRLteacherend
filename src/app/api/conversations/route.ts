import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';

interface StudentConversation {
  student_name: string;
  question: string;
  answer: string;
  comment: string;
  big_comment: string;
  image: string;
  id: number;
  created_at: string;
  updated_at: string;
}

interface FormattedConversation {
  id: string;
  studentName: string;
  messages: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }[];
  startTime: number;
  lastUpdateTime: number;
  status: 'active' | 'completed';
}

type StorageData = Record<string, Record<string, Record<number, StudentConversation>>>;

const EXTERNAL_API = 'http://api-vpc.aix101.com/api/vpc/english/summary';

function getStoreRef() {
  return getStore('student-conversations');
}

/**
 * 核心：仅从 Netlify Blobs 读取数据
 */
async function readDataFromBlobs(): Promise<StorageData | null> {
  try {
    const rawData: any = await getStoreRef().get('all');
    
    // 逻辑 A：正常对象
    if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
      return rawData as StorageData;
    } 
    
    // 逻辑 B：处理错误格式
    if (typeof rawData === 'string') {
      try {
        const parsed = JSON.parse(rawData);
        if (parsed && typeof parsed === 'object') {
          return parsed as StorageData;
        }
      } catch (e) {
        // 静默重置，不在控制台重复刷屏警告
        if (rawData.includes('[object Object]')) {
           return {};
        }
      }
    }

    return {}; // 只要格式不正常，一律返回空对象重新开始
  } catch (err: any) {
    if (!err.message?.includes('MissingBlobsEnvironmentError')) {
      console.error('❌ [Blobs] Read error:', err.message);
    }
    return null;
  }
}



/**
 * 核心：仅向 Netlify Blobs 写入数据
 */
async function writeDataToBlobs(data: StorageData) {
  try {
    // 关键修正：确保存入的是 JSON 字符串，而不是被隐式转换的 "[object Object]"
    await getStoreRef().set('all', JSON.stringify(data));
    console.log('💾 [Blobs] All data persisted to Netlify Blobs');
    return true;
  } catch (err: any) {
    console.error('❌ [Blobs] Failed to write to Blobs:', err.message);
    return false;
  }
}


function buildFormattedConversations(localData: StorageData, filterBigComment: string): FormattedConversation[] {
  const studentDataDict = localData[filterBigComment] || {};

  const formattedConversations: FormattedConversation[] = Object.entries(studentDataDict).map(
    ([studentName, messagesDict]) => {
      const messages = Object.values(messagesDict).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      const chatMessages: FormattedConversation['messages'] = [];
      messages.forEach((msg) => {
        if (msg.answer && msg.answer.trim()) {
          chatMessages.push({
            id: `${msg.id}-answer`,
            role: 'user',
            content: msg.answer,
            timestamp: new Date(msg.created_at).getTime(),
          });
        }
        if (msg.comment && msg.comment.trim()) {
          chatMessages.push({
            id: `${msg.id}-comment`,
            role: 'assistant',
            content: msg.comment,
            timestamp: new Date(msg.created_at).getTime() + 1,
          });
        }
      });

      const startTime = messages.length > 0 ? new Date(messages[0].created_at).getTime() : Date.now();
      const lastUpdateTime = messages.length > 0 ? new Date(messages[messages.length - 1].created_at).getTime() : Date.now();

      return {
        id: `conv-${studentName}-${startTime}`,
        studentName,
        messages: chatMessages,
        startTime,
        lastUpdateTime,
        status: 'completed' as const,
      };
    }
  );

  return formattedConversations.sort((a, b) => b.lastUpdateTime - a.lastUpdateTime).filter(c => c.messages.length > 0);
}

import fs from 'fs';
import path from 'path';

/**
 * 同步逻辑：读取 Blobs -> 获取 API -> 合并 -> 写回 Blobs
 */
async function syncExternalData(): Promise<StorageData> {
  let currentData = await readDataFromBlobs();
  
  // 如果 Blobs 彻底读取失败（故障），则不进行同步以保护数据
  if (currentData === null) {
    return {} as StorageData;
  }
  
  // One-time data seed: 如果 Blobs 刚被重置（空），试着把以前的 data/conversations.json 灌进去
  // 这样网页上原来的数据就不会消失。
  if (Object.keys(currentData).length === 0) {
    console.log('🌱 [Seed] Blobs is empty, attempting to seed from local data file once...');
    const LOCAL_STORAGE_PATH = path.join(process.cwd(), 'data', 'conversations.json');
    if (fs.existsSync(LOCAL_STORAGE_PATH)) {
      try {
        const content = fs.readFileSync(LOCAL_STORAGE_PATH, 'utf-8');
        currentData = JSON.parse(content);
        console.log('🌱 [Seed] Successfully loaded legacy data. It will be pushed to Blobs.');
      } catch (e) {
        console.error('🌱 [Seed] Failed to parse local seed data', e);
      }
    }
  }


  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); 

    const apiUrl = process.env.EXTERNAL_API_URL || EXTERNAL_API;
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      next: { revalidate: 0 }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) return currentData as StorageData;

    const data = await response.json();
    const incomingData: StudentConversation[] = data.result || [];
    let shouldSave = false;
    const safeData = currentData as StorageData;

    incomingData.forEach((item) => {
      if (!item.big_comment || !item.student_name) return;

      if (!safeData[item.big_comment]) safeData[item.big_comment] = {};
      if (!safeData[item.big_comment][item.student_name]) safeData[item.big_comment][item.student_name] = {};

      const existingItem = safeData[item.big_comment][item.student_name][item.id];
      // 如果 ID 冲突但更新时间不同，或者 ID 是全新的，则存入
      if (!existingItem || existingItem.updated_at !== item.updated_at) {
        safeData[item.big_comment][item.student_name][item.id] = item;
        shouldSave = true;
      }
    });

    if (shouldSave) {
      await writeDataToBlobs(safeData);
    }
    return safeData;
  } catch (err: any) {
    console.warn('⚠️ [Sync] API access failed, using current Blobs cache:', err.message);
    return currentData as StorageData;
  }
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filterBigComment = searchParams.get('bigComment') || 'SRL-test';
    const format = searchParams.get('format');

    const localData = await syncExternalData();
    const formattedConversations = buildFormattedConversations(localData, filterBigComment);

    if (format === 'export') {
      return NextResponse.json({
        success: true,
        bigComment: filterBigComment,
        exportedAt: new Date().toISOString(),
        total: formattedConversations.length,
        conversations: formattedConversations,
        raw: localData[filterBigComment] || {},
      });
    }

    return NextResponse.json({
      success: true,
      conversations: formattedConversations,
      total: formattedConversations.length,
    });
  } catch (error) {
    console.error('处理学生对话失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取学生对话失败，请稍后重试',
        conversations: [],
        total: 0,
      },
      { status: 500 }
    );
  }
}
