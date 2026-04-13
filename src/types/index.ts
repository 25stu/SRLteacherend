// 消息类型
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// 对话会话类型
export interface Conversation {
  id: string;
  studentId: string;
  studentName: string;
  startTime: number;
  lastUpdateTime: number;
  messages: Message[];
  status: 'active' | 'completed';
}

// 元认知编码类型
export type MetacognitiveCode = 'PL' | 'MO' | 'RE' | 'EV';

// 元认知编码结果
export interface MetacognitiveAnalysis {
  code: MetacognitiveCode;
  text: string;
  description: string;
}

// 分析报告类型
export interface AnalysisReport {
  conversationId: string;
  studentId: string;
  studentName: string;
  analysisTime: number;
  
  // 元认知编码统计
  metacognitive: {
    PL: number; // 计划与定位
    MO: number; // 监控与察觉
    RE: number; // 策略调节
    EV: number; // 评价与总结
    regulationRatio: number; // 调节比率 (MO+RE)/总语句数
  };
  
  // SRL阶段分析
  srlPhases: {
    planning: number; // 计划阶段
    monitoring: number; // 监控阶段
    regulation: number; // 调节阶段
    evaluation?: number; // 评价阶段
    planningPct?: number;
    monitoringPct?: number;
    regulationPct?: number;
    evaluationPct?: number;
  };
  
  // 学习动机与策略
  motivation: {
    intrinsic: number;
    extrinsic: number;
    taskValue: number;
    selfEfficacy: number;
  };
  
  // 综合评价
  evaluation: {
    overallScore: number;
    questionQuality: number;
    evidenceUsage: number;
    logicalReasoning: number;
    selfReflection: number;
    scoreJustifications?: Record<string, string>;
  };
  
  // 详细编码结果
  detailedCodes: MetacognitiveAnalysis[];
  
  // 核心转变时刻
  microMoments?: {
    momentId: string;
    phase: string;
    beforeText: string;
    afterText: string;
    observedChange: string;
    confidence: number;
  }[];
  
  // 综合评语
  summary: string;
  
  // 教学建议
  suggestions: string[];
  
  // 新增：Markdown 格式的详细报告（来自工作流节点）
  markdownReport?: string;
}

// API请求类型
export interface ChatRequest {
  message: string;
  conversationId: string;
  history: Message[];
}

export interface AnalyzeRequest {
  conversationId: string;
}

// API响应类型
export interface ChatResponse {
  content: string;
  conversationId: string;
}
