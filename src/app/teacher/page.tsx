'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Conversation, AnalysisReport } from '@/types';
import {
  MessageCircle,
  FileText,
  BarChart3,
  Brain,
  Target,
  TrendingUp,
  BookOpen,
  AlertCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Download,
  Layout,
  FileJson,
  Copy,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Plus, Trash2, Save } from 'lucide-react';

export default function TeacherPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);

  // 将分析状态改为按对话 ID 追踪，解决“切换学生时状态重合”的问题
  const [analyzingMap, setAnalyzingMap] = useState<Record<string, boolean>>({});
  const [generatingReportMap, setGeneratingReportMap] = useState<Record<string, boolean>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('list');
  const [error, setError] = useState<string | null>(null);
  const [isMarkdownView, setIsMarkdownView] = useState(false);
  const [currentAgent, setCurrentAgent] = useState('SRL-test');

  const [agents, setAgents] = useState([
    { id: 'SRL-tj1-test', name: '探究1：流域协调发展' },
    { id: 'SRL-tj2-test', name: '探究2：南水北调探究活动' },
    { id: 'SRL-test', name: '探究3：产业转移的影响因素' },
  ]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingAgents, setEditingAgents] = useState([...agents]);

  const [reportsCache, setReportsCache] = useState<Record<string, AnalysisReport>>({});
  const [refreshInterval, setRefreshInterval] = useState(5);
  const [classSummary, setClassSummary] = useState<string | null>(null);
  const [classSummaryCache, setClassSummaryCache] = useState<Record<string, string>>({});
  const [isGeneratingClassSummary, setIsGeneratingClassSummary] = useState(false);
  const [isClassSummaryOpen, setIsClassSummaryOpen] = useState(false);

  // 一键分析所有学生的状态
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, studentName: '' });

  // 辅助函数：设置特定对话的分析状态
  const setStudentAnalyzing = (id: string, isAnalyzing: boolean) => {
    setAnalyzingMap(prev => ({ ...prev, [id]: isAnalyzing }));
  };
  const setStudentGenerating = (id: string, isGenerating: boolean) => {
    setGeneratingReportMap(prev => ({ ...prev, [id]: isGenerating }));
  };

  // 一键全部分析 (支持并发和重置模式)
  const analyzeAllConversations = async (mode: 'missing' | 'all' = 'missing') => {
    if (conversations.length === 0) return;

    // 筛选目标
    const targets = mode === 'missing'
      ? conversations.filter(c => !reportsCache[c.id])
      : conversations;

    if (targets.length === 0) {
      toast.info(mode === 'missing' ? '没有待分析的新学生' : '暂无学生可分析');
      return;
    }

    setIsBatchAnalyzing(true);
    let completedCount = 0;
    setBatchProgress({ current: 0, total: targets.length, studentName: '初始化...' });

    // 定义并发池（控制同时进行的分析数量，避免 Dify API 超限）
    // 为了数据一致性（防止多个并发请求同时修改 master blob 造成覆盖），设置并发为 1
    const CONCURRENCY_LIMIT = 1;
    const pool = [...targets];

    const worker = async () => {
      while (pool.length > 0) {
        const conv = pool.shift();
        if (!conv) break;

        setBatchProgress(prev => ({ ...prev, studentName: conv.studentName }));
        setStudentAnalyzing(conv.id, true);

        try {
          // 第一阶段：评分
          const scoreRes = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'getScore',
              conversationId: conv.id,
              messages: conv.messages,
              studentName: conv.studentName,
              bigComment: currentAgent,
            }),
          });

          if (scoreRes.ok) {
            const scoreResult = await scoreRes.json();
            saveReportToCache(conv.id, scoreResult);

            // 如果切换到了该同学详情页，同步更新结果
            if (selectedConversation?.id === conv.id) setAnalysisReport(scoreResult);

            // 第二阶段：详细报告
            setStudentGenerating(conv.id, true);
            const reportRes = await fetch('/api/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'getReport',
                conversationId: conv.id,
                messages: conv.messages,
                studentName: conv.studentName,
                bigComment: currentAgent,
                previousResult: scoreResult
              }),
            });

            if (reportRes.ok) {
              const reportData = await reportRes.json();
              const finalReport = { ...scoreResult, markdownReport: reportData.markdownReport };
              saveReportToCache(conv.id, finalReport);
              if (selectedConversation?.id === conv.id) setAnalysisReport(finalReport);
            }
          }
        } catch (e) {
          console.error(`分析 ${conv.studentName} 失败`, e);
        } finally {
          setStudentAnalyzing(conv.id, false);
          setStudentGenerating(conv.id, false);
          completedCount++;
          setBatchProgress(prev => ({ ...prev, current: completedCount }));
        }
      }
    };

    // 启动多个 worker 并行工作
    const workers = Array(Math.min(CONCURRENCY_LIMIT, targets.length))
      .fill(null)
      .map(() => worker());

    await Promise.all(workers);
    toast.success('全部分析任务已完成');
    setIsBatchAnalyzing(false);
  };

  const loadAnalyzeCaches = async () => {
    try {
      const response = await fetch('/api/analyze?action=getAllData');
      if (!response.ok) return null;

      const data = await response.json();
      if (data.reports) setReportsCache(data.reports);
      if (data.summaries) setClassSummaryCache(data.summaries);

      return {
        reports: data.reports || {},
        summaries: data.summaries || {},
      };
    } catch (e) {
      console.warn('Failed to load server caches', e);
      return null;
    }
  };

  const loadReportForConversation = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/analyze?action=getReport&conversationId=${encodeURIComponent(conversationId)}`);
      if (!response.ok) return null;

      const data = await response.json();
      if (data.report) {
        saveReportToCache(conversationId, data.report);
        return data.report as AnalysisReport;
      }
    } catch (e) {
      console.warn('Failed to load report from server', e);
    }

    return null;
  };
  // 从服务端加载初始数据
  useEffect(() => {
    // 1. 加载智能体配置
    const loadAgents = async () => {
      try {
        const response = await fetch('/api/agents');
        if (response.ok) {
          const data = await response.json();
          setAgents(data);
          setEditingAgents(data);
          if (data.length > 0 && !currentAgent) {
            setCurrentAgent(data[0].id);
          }
        }
      } catch (e) {
        console.error('Failed to load agents from server', e);
      }
    };

    // 2. 加载报告和全班总结缓存
    const loadCaches = async () => {
      try {
        const response = await fetch('/api/analyze?action=getAllData');
        if (response.ok) {
          const data = await response.json();
          if (data.reports) setReportsCache(data.reports);
          if (data.summaries) setClassSummaryCache(data.summaries);
        }
      } catch (e) {
        console.warn('Failed to load server caches');
      }
    };

    loadAgents();
    loadAnalyzeCaches();
  }, []);

  // 保存报告到缓存 (仅更新本地状态，服务端在API调用时已保存)
  const saveReportToCache = (id: string, report: AnalysisReport) => {
    setReportsCache(prev => ({ ...prev, [id]: report }));
  };

  // 保存全班总结到缓存 (仅更新本地状态，服务端在API调用时已保存)
  const saveClassSummaryToCache = (agentId: string, summary: string) => {
    setClassSummaryCache(prev => ({ ...prev, [agentId]: summary }));
  };

  // 从外部API加载对话 (加个参数标识是否是静默加载，不显示loading)
  const fetchConversations = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations?bigComment=${currentAgent}`);
      const data = await response.json();

      if (data.success) {
        setConversations(data.conversations);
      } else {
        if (!silent) setError(data.error || '获取对话失败');
      }
    } catch (err) {
      console.error('获取对话失败:', err);
      if (!silent) setError('网络错误，请稍后重试');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // 初始加载及切换智能体时加载，并设置轮询
  useEffect(() => {
    fetchConversations();

    let interval: NodeJS.Timeout | null = null;
    if (refreshInterval > 0) {
      interval = setInterval(() => {
        fetchConversations(true); // 静默模式后台更新
      }, refreshInterval * 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentAgent, refreshInterval]);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 格式化消息时长
  const formatDuration = (startTime: number, lastUpdateTime: number) => {
    const diff = lastUpdateTime - startTime;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    return `${hours}小时${minutes % 60}分钟`;
  };

  // 分析对话
  const analyzeConversation = async (force = false) => {
    if (!selectedConversation) return;

    // 如果已有缓存且不是强制重新生成，则直接显示
    if (!force && reportsCache[selectedConversation.id]) {
      setAnalysisReport(reportsCache[selectedConversation.id]);
      setActiveTab('report');
      return;
    }

    const convId = selectedConversation.id;
    setStudentAnalyzing(convId, true);
    setError(null);
    setAnalysisReport(null);

    try {
      // 第一步：获取结构化分数
      const scoreResponse = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getScore',
          conversationId: convId,
          messages: selectedConversation.messages,
          studentName: selectedConversation.studentName,
          bigComment: currentAgent,
        }),
      });

      if (!scoreResponse.ok) {
        throw new Error('获取评分失败');
      }

      const scoreResult = await scoreResponse.json();
      setAnalysisReport(scoreResult);
      saveReportToCache(convId, scoreResult);
      setActiveTab('report');
      setStudentAnalyzing(convId, false); // 第一步结束

      // 第二步：获取 Markdown 报告（异步进行）
      setStudentGenerating(convId, true);
      try {
        const reportResponse = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'getReport',
            conversationId: convId,
            messages: selectedConversation.messages,
            studentName: selectedConversation.studentName,
            bigComment: currentAgent,
            previousResult: scoreResult
          }),
        });

        if (reportResponse.ok) {
          const reportData = await reportResponse.json();
          const finalReport = { ...scoreResult, markdownReport: reportData.markdownReport };
          setAnalysisReport(finalReport);
          saveReportToCache(convId, finalReport);
        }
      } catch (e) {
        console.error('Workflow error:', e);
      } finally {
        setStudentGenerating(convId, false);
      }

    } catch (error: any) {
      console.error('分析失败:', error);
      toast.error(error.message || '分析失败，请重试');
      setStudentAnalyzing(convId, false);
    }
  };

  // 生成全班总结报告
  const generateClassSummary = async (isRegenerate = false) => {
    if (conversations.length === 0) {
      toast.error('当前暂无学生对话，无法生成总结');
      return;
    }

    // 如果不是重新生成，且已有缓存，则直接展示
    if (!isRegenerate && classSummaryCache[currentAgent]) {
      setClassSummary(classSummaryCache[currentAgent]);
      setIsClassSummaryOpen(true);
      return;
    }

    setIsGeneratingClassSummary(true);
    setClassSummary(null); // 清空旧内容
    setIsClassSummaryOpen(true);

    try {
      // 遍历当前智能体下的所有学生
      const classDataSummary = conversations.map(conv => {
        const cachedReport = reportsCache[conv.id];

        if (cachedReport && cachedReport.summary) {
          // 如果已有分析总结，使用总结
          return `### 学生: ${conv.studentName} (已有分析)
分析总结: ${cachedReport.summary}
数据评分: 总分 ${cachedReport.evaluation.overallScore}, 调节比率 ${(cachedReport.metacognitive.regulationRatio * 100).toFixed(0)}%`;
        } else {
          // 否则使用原始对话内容的简化版（避免内容过长，取最后10条或拼接）
          const latestMessages = conv.messages.slice(-10);
          const convText = latestMessages
            .map(m => `${m.role === 'user' ? '学生' : '助手'}: ${m.content}`)
            .join('\n');

          return `### 学生: ${conv.studentName} (原始对话)
对话片段:
${convText}`;
        }
      }).join('\n\n---\n\n');

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getClassSummary',
          classData: classDataSummary,
          className: agents.find(a => a.id === currentAgent)?.name || '全班',
          bigComment: currentAgent,
          messages: [] // API 校验需要有 messages 数组
        }),
      });

      if (!response.ok) throw new Error('生成全班总结失败');

      const data = await response.json();
      const reportContent = data.markdownReport;
      setClassSummary(reportContent);
      saveClassSummaryToCache(currentAgent, reportContent);
    } catch (error) {
      console.error('Class summary failed:', error);
      toast.error('生成全班总结失败');
    } finally {
      setIsGeneratingClassSummary(false);
    }
  };

  // 导出报表为文件
  const exportSummaryToFile = () => {
    if (!classSummary) return;

    const agentName = agents.find(a => a.id === currentAgent)?.name || '全班';
    const filename = `${agentName}_总结报告_${new Date().toISOString().slice(0, 10)}.md`;
    const blob = new Blob([classSummary], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('报告导出开始下载');
  };

  const exportAgentConversations = async (agentId: string) => {
    try {
      const response = await fetch(`/api/conversations?bigComment=${encodeURIComponent(agentId)}&format=export`);
      if (!response.ok) throw new Error('导出失败');

      const data = await response.json();
      const agentName = agents.find(a => a.id === agentId)?.name || agentId;
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `${agentName}_对话数据_${dateStr}.json`;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`已开始下载: ${filename}`);
    } catch (error) {
      console.error('导出失败:', error);
      toast.error('导出学生对话数据失败');
    }
  };

  const exportAgentReports = async (agentId: string) => {
    try {
      const response = await fetch('/api/analyze?action=getAllData');
      if (!response.ok) throw new Error('导出失败');

      const allData = await response.json();
      const agentName = agents.find(a => a.id === agentId)?.name || agentId;
      const dateStr = new Date().toISOString().split('T')[0];

      // 筛选属于该 agent 的报告 (需要判断 conversation 是否属于该 agent)
      // 由于 analysis reports 里没有直接存 agentId，我们需要通过当前的 conversations 列表来过滤，
      // 或者干脆导出所有报告，由用户筛选。但通常教师只想导当前智能体的。

      const agentConvIds = conversations.map(c => c.id);
      const filteredReports = Object.values(allData.reports || {})
        .filter((r: any) => agentConvIds.includes(r.conversationId));

      const exportData = {
        agentId,
        agentName,
        exportedAt: new Date().toISOString(),
        total: filteredReports.length,
        reports: filteredReports,
        classSummary: allData.summaries ? allData.summaries[agentId] : null
      };

      const filename = `${agentName}_分析报告_${dateStr}.json`;
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`已开始下载: ${filename}`);
    } catch (error) {
      console.error('导出报告失败:', error);
      toast.error('导出分析报告失败');
    }
  };

  // 获取元认知编码标签颜色
  const getCodeColor = (code: string) => {
    switch (code) {
      case 'PL': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'MO': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
      case 'RE': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'EV': return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // 获取元认知编码描述
  const getCodeDescription = (code: string) => {
    switch (code) {
      case 'PL': return '计划与定位';
      case 'MO': return '监控与察觉';
      case 'RE': return '策略调节';
      case 'EV': return '评价与总结';
      default: return '';
    }
  };

  // 生成Markdown格式的报告
  const generateMarkdown = (report: AnalysisReport) => {
    if (!report) return '';
    return `
# 学生元认知分析报告: ${report.studentName || '未知学生'}

**分析时间**: ${new Date(report.analysisTime).toLocaleString('zh-CN')}

## 1. 综合表现
- **整体评分**: ${Number(report.evaluation.overallScore || 0).toFixed(1)} / 10
- **问题质量**: ${Number(report.evaluation.questionQuality || 0).toFixed(1)}
- **证据使用**: ${Number(report.evaluation.evidenceUsage || 0).toFixed(1)}
- **逻辑推理**: ${Number(report.evaluation.logicalReasoning || 0).toFixed(1)}
- **自我反思**: ${Number(report.evaluation.selfReflection || 0).toFixed(1)}

## 2. 元认知行为统计
| 维度 | 对应编码 | 触发次数 |
| :--- | :--- | :--- |
| **计划与定位** | PL | ${report.metacognitive.PL} |
| **监控与察觉** | MO | ${report.metacognitive.MO} |
| **策略调节** | RE | ${report.metacognitive.RE} |
| **评价与总结** | EV | ${report.metacognitive.EV} |

> **调节比率 (Regulation Ratio)**: ${(Number(report.metacognitive.regulationRatio || 0) * 100).toFixed(1)}%

## 3. 总体评估总结
${report.summary}

## 4. 针对性教学建议
${report.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

---
*本报告由 SRL-Teacher AI 模型根据学生对话表现自动生成*
    `.trim();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold dark:text-white">教师端 - 对话分析</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              查看学生对话记录，分析元认知表现
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">自动刷新:</span>
              <Select
                value={refreshInterval.toString()}
                onValueChange={(val) => setRefreshInterval(Number(val))}
              >
                <SelectTrigger className="w-[100px] h-9">
                  <SelectValue placeholder="选择间隔" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5秒</SelectItem>
                  <SelectItem value="10">10秒</SelectItem>
                  <SelectItem value="30">30秒</SelectItem>
                  <SelectItem value="60">1分钟</SelectItem>
                  <SelectItem value="0">关闭</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchConversations()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              刷新数据
            </Button>

            {/* 智能体设置 */}
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" />
                  智能体设置
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>智能体配置 (big_comment)</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {editingAgents.map((agent, index) => (
                    <div key={index} className="flex gap-4 items-end border-b pb-4">
                      <div className="flex-1 space-y-2">
                        <Label>显示名称</Label>
                        <Input
                          value={agent.name}
                          onChange={(e) => {
                            const newAgents = [...editingAgents];
                            newAgents[index].name = e.target.value;
                            setEditingAgents(newAgents);
                          }}
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label>big_comment 标识符</Label>
                        <Input
                          value={agent.id}
                          onChange={(e) => {
                            const newAgents = [...editingAgents];
                            newAgents[index].id = e.target.value;
                            setEditingAgents(newAgents);
                          }}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500"
                        onClick={() => {
                          const newAgents = editingAgents.filter((_, i) => i !== index);
                          setEditingAgents(newAgents);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setEditingAgents([...editingAgents, { id: '', name: '' }])}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    添加新智能体
                  </Button>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsSettingsOpen(false)}>取消</Button>
                  <Button onClick={async () => {
                    try {
                      const response = await fetch('/api/agents', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(editingAgents)
                      });
                      if (response.ok) {
                        setAgents(editingAgents);
                        setIsSettingsOpen(false);
                        toast.success('配置已保存到服务端');
                      } else {
                        throw new Error('保存失败');
                      }
                    } catch (e) {
                      toast.error('无法保存配置到服务端');
                    }
                  }}>
                    <Save className="w-4 h-4 mr-2" />
                    保存配置
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <a href="/" className="text-blue-600 hover:underline text-sm">
              返回首页
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <Card
              key={agent.id}
              className={`cursor-pointer transition-all border-2 ${currentAgent === agent.id ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20' : 'hover:border-gray-300'}`}
              onClick={() => {
                setCurrentAgent(agent.id);
                setSelectedConversation(null);
                setAnalysisReport(null);
                setActiveTab('list');
              }}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${currentAgent === agent.id ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                  {agents.indexOf(agent) % 3 === 0 && <Target className="w-5 h-5" />}
                  {agents.indexOf(agent) % 3 === 1 && <Brain className="w-5 h-5" />}
                  {agents.indexOf(agent) % 3 === 2 && <Layout className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <h3 className={`text-sm font-bold ${currentAgent === agent.id ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200'}`}>
                    {agent.name}
                  </h3>
                  <p className="text-[10px] text-gray-500 mt-0.5">{agent.id}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-blue-600"
                        onClick={(e) => e.stopPropagation()}
                        title="导出选项"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>导出数据 - {agent.name}</DialogTitle>
                        <DialogDescription>
                          请选择您想要导出的数据类型
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid grid-cols-2 gap-4 py-4">
                        <Button
                          variant="outline"
                          className="flex flex-col h-24 gap-2"
                          onClick={() => exportAgentConversations(agent.id)}
                        >
                          <MessageCircle className="w-6 h-6 text-blue-500" />
                          <div className="text-sm font-bold">导出所有对话</div>
                          <div className="text-[10px] text-gray-500">JSON 原始聊天记录</div>
                        </Button>
                        <Button
                          variant="outline"
                          className="flex flex-col h-24 gap-2"
                          onClick={() => exportAgentReports(agent.id)}
                        >
                          <BarChart3 className="w-6 h-6 text-green-500" />
                          <div className="text-sm font-bold">导出所有分析</div>
                          <div className="text-[10px] text-gray-500">JSON 报告与评分汇总</div>
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                {currentAgent === agent.id && (
                  <CheckCircle className="w-5 h-5 text-blue-500" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="list" className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              对话列表 ({conversations.length})
            </TabsTrigger>
            <TabsTrigger value="detail" className="flex items-center gap-2" disabled={!selectedConversation}>
              <FileText className="w-4 h-4" />
              对话详情
            </TabsTrigger>
            <TabsTrigger value="report" className="flex items-center gap-2" disabled={!analysisReport}>
              <BarChart3 className="w-4 h-4" />
              分析报告
            </TabsTrigger>
          </TabsList>

          {/* 对话列表 */}
          <TabsContent value="list">
            <div className="grid gap-4">
              {conversations.length > 0 && !isLoading && !error && (
                <div className="flex justify-between items-center mb-2 px-1 gap-4">
                  <div className="text-sm font-medium text-gray-500 flex-1">
                    当前智能体学生表现汇总
                  </div>

                  {isBatchAnalyzing ? (
                    <div className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-1.5 rounded-full border border-indigo-100 dark:border-indigo-800 animate-pulse">
                      <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                      <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                        正在批量分析: {batchProgress.studentName} ({batchProgress.current}/{batchProgress.total})
                      </span>
                    </div>
                  ) : (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 h-8"
                        >
                          <Brain className="w-4 h-4 mr-2" />
                          一键批量分析
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>批量分析选项</DialogTitle>
                          <DialogDescription>
                            系统将同时通过 3 个线程进行并发分析，大幅缩短等待时间。
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-4 py-4">
                          <Button
                            variant="outline"
                            className="flex flex-col h-24 gap-2 border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50"
                            onClick={() => analyzeAllConversations('missing')}
                          >
                            <Plus className="w-6 h-6 text-indigo-600" />
                            <div className="text-sm font-bold">仅分析新学生</div>
                            <div className="text-[10px] text-gray-500">仅处理尚未生成报告的学生</div>
                          </Button>
                          <Button
                            variant="outline"
                            className="flex flex-col h-24 gap-2 border-orange-100 hover:border-orange-300 hover:bg-orange-50"
                            onClick={() => analyzeAllConversations('all')}
                          >
                            <RefreshCw className="w-6 h-6 text-orange-600" />
                            <div className="text-sm font-bold">全班重新分析</div>
                            <div className="text-[10px] text-gray-500">清除旧缓存并更新全班报告</div>
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}

                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => generateClassSummary()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white h-8"
                  >
                    <Layout className="w-4 h-4 mr-2" />
                    生成全班分析报告
                  </Button>
                </div>
              )}

              {isLoading ? (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    <Loader2 className="w-12 h-12 mx-auto mb-4 opacity-50 animate-spin" />
                    <p>正在加载学生对话...</p>
                  </CardContent>
                </Card>
              ) : error ? (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{error}</p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => fetchConversations()}
                    >
                      重试
                    </Button>
                  </CardContent>
                </Card>
              ) : conversations.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>暂无学生对话记录</p>
                    <p className="text-sm mt-2">等待学生完成探究对话后，记录将显示在这里</p>
                  </CardContent>
                </Card>
              ) : (
                conversations.map((conv) => (
                  <Card
                    key={conv.id}
                    className="cursor-pointer hover:shadow-md transition-shadow relative overflow-hidden"
                    onClick={() => {
                      setSelectedConversation(conv);
                      // 如果缓存中有报告，则自动加载
                      if (reportsCache[conv.id]) {
                        setAnalysisReport(reportsCache[conv.id]);
                      } else {
                        setAnalysisReport(null);
                      }
                      setActiveTab('detail');
                    }}
                  >
                    {reportsCache[conv.id] && (
                      <div className="absolute top-0 right-0">
                        <Badge className="rounded-none rounded-bl-lg bg-green-500 hover:bg-green-600">已分析</Badge>
                      </div>
                    )}
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                            <MessageCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <h3 className="font-semibold dark:text-white">{conv.studentName}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {formatTime(conv.startTime)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                          <div className="text-center">
                            <p className="font-medium text-gray-900 dark:text-white">{conv.messages.length}</p>
                            <p>消息数</p>
                          </div>
                          <div className="text-center">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {formatDuration(conv.startTime, conv.lastUpdateTime)}
                            </p>
                            <p>时长</p>
                          </div>
                          <Badge variant={conv.status === 'active' ? 'default' : 'secondary'}>
                            {conv.status === 'active' ? '进行中' : '已完成'}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* 对话详情 */}
          <TabsContent value="detail">
            {selectedConversation && (
              <div className="grid lg:grid-cols-3 gap-6">
                {/* 对话内容 */}
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <MessageCircle className="w-5 h-5" />
                        {selectedConversation.studentName} 的对话
                      </CardTitle>
                      <Button
                        onClick={() => analyzeConversation(false)}
                        disabled={analyzingMap[selectedConversation.id]}
                      >
                        {analyzingMap[selectedConversation.id] ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            分析中...
                          </>
                        ) : (
                          <>
                            <BarChart3 className="w-4 h-4 mr-2" />
                            {reportsCache[selectedConversation.id] ? '重新分析' : '开始分析'}
                          </>
                        )}
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[500px] pr-4">
                        <div className="space-y-4">
                          {selectedConversation.messages.map((msg, idx) => (
                            <div
                              key={msg.id}
                              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-[80%] rounded-lg px-4 py-2 ${msg.role === 'user'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                                  }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium opacity-70">
                                    {msg.role === 'user' ? '学生' : 'AI助手'}
                                  </span>
                                  <span className="text-xs opacity-50">
                                    #{idx + 1}
                                  </span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>

                {/* 对话统计 */}
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">对话统计</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">总消息数</span>
                        <span className="font-semibold">{selectedConversation.messages.length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">学生发言</span>
                        <span className="font-semibold">
                          {selectedConversation.messages.filter(m => m.role === 'user').length}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">AI回复</span>
                        <span className="font-semibold">
                          {selectedConversation.messages.filter(m => m.role === 'assistant').length}
                        </span>
                      </div>
                      <Separator />
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">对话时长</span>
                        <span className="font-semibold">
                          {formatDuration(selectedConversation.startTime, selectedConversation.lastUpdateTime)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">快速操作</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => analyzeConversation(false)}
                        disabled={analyzingMap[selectedConversation.id]}
                      >
                        <BarChart3 className="w-4 h-4 mr-2" />
                        {reportsCache[selectedConversation.id] ? '更新分析报告' : '生成分析报告'}
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          const text = selectedConversation.messages
                            .map(m => `${m.role === 'user' ? '学生' : 'AI'}: ${m.content}`)
                            .join('\n\n');
                          const blob = new Blob([text], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `对话记录-${selectedConversation.studentName}.txt`;
                          a.click();
                        }}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        导出对话记录
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          {/* 分析报告 */}
          <TabsContent value="report">
            {analysisReport && (
              <div className="space-y-6">
                {/* 报告工具栏 */}
                <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Button
                      variant={!isMarkdownView ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setIsMarkdownView(false)}
                      className="gap-2"
                    >
                      <Layout className="w-4 h-4" />
                      可视化视图
                    </Button>
                    <Button
                      variant={isMarkdownView ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setIsMarkdownView(true)}
                      className="gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      Markdown视图
                    </Button>
                    <Separator orientation="vertical" className="h-6 mx-2" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => analyzeConversation(true)}
                      disabled={analyzingMap[analysisReport.conversationId] || generatingReportMap[analysisReport.conversationId]}
                      className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${analyzingMap[analysisReport.conversationId] ? 'animate-spin' : ''}`} />
                      重新生成报告
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(analysisReport.markdownReport || generateMarkdown(analysisReport))}
                      className="gap-2"
                    >
                      <Copy className="w-4 h-4" />
                      复制Markdown
                    </Button>
                  </div>
                </div>

                {isMarkdownView ? (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between border-b bg-gray-50/50 dark:bg-gray-900/50">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-500" />
                        分析报告 (Markdown 渲染)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="h-[700px]">
                        {/* 渲染区 */}
                        <ScrollArea className="h-full bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
                          <div className="markdown-content">
                            <div className="relative">
                              {(analyzingMap[analysisReport.conversationId] || generatingReportMap[analysisReport.conversationId]) && (
                                <div className="absolute inset-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center rounded-lg min-h-[400px]">
                                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                                  <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                                    {analyzingMap[analysisReport.conversationId] ? "正在进行结构化分析..." : "正在通过对话流生成详细报告..."}
                                  </p>
                                  <p className="text-sm text-gray-500 mt-2">请耐心等待，这是一项复杂的深度分析任务</p>
                                </div>
                              )}
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {analysisReport.markdownReport || (!generatingReportMap[analysisReport.conversationId] ? generateMarkdown(analysisReport) : '')}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </ScrollArea>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* 原有的可视化卡片内容... */}
                    <div className="grid md:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                              <Brain className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">元认知总分</p>
                              <p className="text-2xl font-bold dark:text-white">
                                {Number(analysisReport.evaluation.overallScore || 0).toFixed(1)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                              <Target className="w-6 h-6 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">问题质量</p>
                              <p className="text-2xl font-bold dark:text-white">
                                {Number(analysisReport.evaluation.questionQuality || 0).toFixed(1)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900 rounded-lg flex items-center justify-center">
                              <TrendingUp className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">调节比率</p>
                              <p className="text-2xl font-bold dark:text-white">
                                {(Number(analysisReport.metacognitive.regulationRatio || 0) * 100).toFixed(0)}%
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                              <BookOpen className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">证据使用</p>
                              <p className="text-2xl font-bold dark:text-white">
                                {Number(analysisReport.evaluation.evidenceUsage || 0).toFixed(1)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* 详细分析 */}
                    <div className="grid lg:grid-cols-2 gap-6">
                      {/* 元认知编码分布 */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Brain className="w-5 h-5" />
                            元认知编码分布
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {(['PL', 'MO', 'RE', 'EV'] as const).map((code) => (
                            <div key={code}>
                              <div className="flex justify-between mb-1">
                                <span className="text-sm font-medium">
                                  {code} - {getCodeDescription(code)}
                                </span>
                                <span className="text-sm text-gray-500">
                                  {analysisReport.metacognitive[code]} 次
                                </span>
                              </div>
                              <Progress
                                value={(Number(analysisReport.metacognitive[code] || 0) / Math.max(1, ...Object.values(analysisReport.metacognitive).slice(0, 4).map(v => Number(v) || 0))) * 100}
                                className="h-2"
                              />
                            </div>
                          ))}
                          <Separator />
                          <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3">
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                              <strong>调节比率分析：</strong>
                              {(Number(analysisReport.metacognitive.regulationRatio || 0) * 100).toFixed(0)}%
                              {Number(analysisReport.metacognitive.regulationRatio || 0) > 0.3 ? (
                                <span className="ml-1">- 该生在探究中自我调节活跃</span>
                              ) : (
                                <span className="ml-1">- 建议教师介入提供工具引导</span>
                              )}
                            </p>
                          </div>
                        </CardContent>
                      </Card>

                      {/* SRL阶段分析 */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Target className="w-5 h-5" />
                            SRL阶段表现
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {(() => {
                            const planning = analysisReport.srlPhases?.planningPct ?? analysisReport.srlPhases?.planning ?? 0;
                            const monitoring = analysisReport.srlPhases?.monitoringPct ?? analysisReport.srlPhases?.monitoring ?? 0;
                            const regulation = analysisReport.srlPhases?.regulationPct ?? analysisReport.srlPhases?.regulation ?? 0;
                            const evaluationValue = analysisReport.srlPhases?.evaluationPct ?? analysisReport.srlPhases?.evaluation ?? 0;

                            const hasData = planning > 0 || monitoring > 0 || regulation > 0 || evaluationValue > 0;

                            // 如果没有阶段数据，从元认知编码数量估算
                            let displayPhases = { planning, monitoring, regulation, evaluation: evaluationValue };

                            if (!hasData) {
                              const meta = analysisReport.metacognitive;
                              const total = meta.PL + meta.MO + meta.RE + meta.EV;
                              if (total > 0) {
                                displayPhases = {
                                  planning: Math.round((meta.PL / total) * 100),
                                  monitoring: Math.round(((meta.MO + meta.EV * 0.5) / total) * 100),
                                  regulation: Math.round(((meta.RE + meta.EV * 0.5) / total) * 100),
                                  evaluation: 0
                                };
                              }
                            }

                            return (
                              <>
                                <div>
                                  <div className="flex justify-between mb-1">
                                    <span className="text-sm font-medium">计划阶段</span>
                                    <span className="text-sm text-gray-500">
                                      {Number(displayPhases.planning).toFixed(1)}%
                                    </span>
                                  </div>
                                  <Progress value={Number(displayPhases.planning)} className="h-2" />
                                </div>
                                <div>
                                  <div className="flex justify-between mb-1">
                                    <span className="text-sm font-medium">监控阶段</span>
                                    <span className="text-sm text-gray-500">
                                      {Number(displayPhases.monitoring).toFixed(1)}%
                                    </span>
                                  </div>
                                  <Progress value={Number(displayPhases.monitoring)} className="h-2" />
                                </div>
                                <div>
                                  <div className="flex justify-between mb-1">
                                    <span className="text-sm font-medium">调节阶段</span>
                                    <span className="text-sm text-gray-500">
                                      {Number(displayPhases.regulation).toFixed(1)}%
                                    </span>
                                  </div>
                                  <Progress value={Number(displayPhases.regulation)} className="h-2" />
                                </div>
                                {(displayPhases.evaluation > 0) && (
                                  <div>
                                    <div className="flex justify-between mb-1">
                                      <span className="text-sm font-medium">评价/反思阶段</span>
                                      <span className="text-sm text-gray-500">
                                        {Number(displayPhases.evaluation).toFixed(1)}%
                                      </span>
                                    </div>
                                    <Progress value={Number(displayPhases.evaluation)} className="h-2" />
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </CardContent>
                      </Card>

                      {/* 评价维度得分 */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-blue-500" />
                            评价维度得分
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {Object.entries(analysisReport.evaluation).map(([key, value]) => (
                            key !== 'overallScore' && key !== 'scoreJustifications' && typeof value === 'number' && (
                              <div key={key} className="group relative">
                                <div className="flex justify-between mb-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                      {key === 'questionQuality' ? '问题质量' :
                                        key === 'evidenceUsage' ? '证据使用' :
                                          key === 'logicalReasoning' ? '逻辑推理' :
                                            key === 'selfReflection' ? '自我反思' : key}
                                    </span>
                                    {analysisReport.evaluation.scoreJustifications?.[key] && (
                                      <div className="group-hover:block hidden absolute z-10 w-64 p-3 mt-8 text-xs leading-relaxed text-white bg-gray-900/95 backdrop-blur-sm rounded-lg shadow-xl -left-2 transition-all">
                                        <div className="font-bold mb-1 border-b border-gray-700 pb-1">评价依据</div>
                                        {analysisReport.evaluation.scoreJustifications[key]}
                                      </div>
                                    )}
                                    {analysisReport.evaluation.scoreJustifications?.[key] && (
                                      <AlertCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                                    )}
                                  </div>
                                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{Number(value || 0).toFixed(1)}</span>
                                </div>
                                <Progress value={Number(value || 0) * 10} className="h-2 bg-blue-100 dark:bg-gray-800" />
                              </div>
                            )
                          ))}
                        </CardContent>
                      </Card>

                      {/* 教学建议 */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            教学建议
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-3">
                            {analysisReport.suggestions.map((suggestion, idx) => (
                              <li key={idx} className="flex items-start gap-3 p-2 rounded-lg hover:bg-green-50/50 dark:hover:bg-green-900/10 transition-colors">
                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                <span className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{suggestion}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>

                      {/* 核心转变时刻 (MicroMoments) */}
                      {/* {analysisReport.microMoments && analysisReport.microMoments.length > 0 && (
                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-orange-500" />
                          认知突破/核心转变时刻
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {analysisReport.microMoments.map((moment) => (
                            <div key={moment.momentId} className="border border-orange-100 dark:border-orange-900/30 bg-orange-50/50 dark:bg-orange-950/20 rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <Badge variant="outline" className="text-[10px] uppercase font-bold text-orange-600 border-orange-200">
                                  {moment.phase}
                                </Badge>
                                <span className="text-[10px] text-gray-400">
                                  置信度: {(moment.confidence * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-gray-500 line-through truncate">{moment.beforeText}</p>
                                <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{moment.afterText}</p>
                              </div>
                              <div className="pt-1 border-t border-orange-100 dark:border-orange-900/30">
                                <p className="text-[10px] font-semibold text-orange-700 dark:text-orange-400">
                                  变化: {moment.observedChange}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )} */}

                    </div>

                    {/* 综合评语 */}
                    <Card>
                      <CardHeader>
                        <CardTitle>综合评语</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {analysisReport.summary}
                        </p>
                      </CardContent>
                    </Card>

                    {/* 详细编码结果 */}
                    {analysisReport.detailedCodes && analysisReport.detailedCodes.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>元认知编码详情</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-[300px]">
                            <div className="space-y-2">
                              {analysisReport.detailedCodes.map((item, idx) => (
                                <div key={idx} className="flex items-start gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                                  <Badge className={getCodeColor(item.code)}>
                                    {item.code}
                                  </Badge>
                                  <div className="flex-1">
                                    <p className="text-sm">{item.text}</p>
                                    <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* 全班总结弹窗 */}
      <Dialog open={isClassSummaryOpen} onOpenChange={setIsClassSummaryOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] h-[calc(100vh-1.5rem)] max-h-[calc(100vh-1.5rem)] sm:w-[92vw] sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl flex flex-col p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-5 sm:p-6 border-b shrink-0 bg-white dark:bg-gray-800 z-10">
            <DialogTitle className="flex items-center gap-2 pr-10 text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100">
              <Layout className="w-6 h-6 text-indigo-600" />
              {agents.find(a => a.id === currentAgent)?.name} - 全班性分析汇总
            </DialogTitle>
            <DialogDescription className="sr-only">Class summary dialog.</DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 px-5 py-4 sm:px-8 sm:py-6 text-left bg-white dark:bg-gray-900">
            <div className="markdown-content pb-12 mx-auto max-w-5xl">
              {isGeneratingClassSummary ? (
                <div className="py-20 flex flex-col items-center justify-center text-center">
                  <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                  <p className="text-lg font-medium text-gray-900 dark:text-gray-100">正在根据全班表现生成深度汇总报告...</p>
                  <p className="text-sm text-gray-500 mt-2">系统由于汇总了多位学生的表现，耗时可能较长，约需 1-2 分钟</p>
                </div>
              ) : classSummary ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {classSummary}
                </ReactMarkdown>
              ) : (
                <div className="text-center py-10 text-gray-500">
                  暂无生成结果，请确保先分析了至少一名学生
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 sm:p-6 border-t bg-gray-50 dark:bg-gray-900 flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button
                variant="outline"
                size="lg"
                onClick={() => copyToClipboard(classSummary || '')}
                disabled={!classSummary || isGeneratingClassSummary}
                className="font-medium w-full sm:w-auto"
              >
                <Copy className="w-4 h-4 mr-2" />
                复制内容
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={exportSummaryToFile}
                disabled={!classSummary || isGeneratingClassSummary}
                className="font-medium w-full sm:w-auto"
              >
                <FileText className="w-4 h-4 mr-2" />
                导出报告 (.md)
              </Button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:justify-end">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => generateClassSummary(true)}
                disabled={isGeneratingClassSummary}
                className="font-medium w-full sm:w-auto"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isGeneratingClassSummary ? 'animate-spin' : ''}`} />
                重新生成
              </Button>
              <Button
                size="lg"
                onClick={() => setIsClassSummaryOpen(false)}
                className="bg-gray-900 hover:bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900 px-8 w-full sm:w-auto"
              >
                关闭窗口
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

