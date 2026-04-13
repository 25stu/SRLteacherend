'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Trash2, Plus, MessageCircle, BookOpen, User, GraduationCap, Sparkles, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Message, Conversation } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import MaterialFloatWindow, { StepKey, MATERIALS } from '@/components/MaterialFloatWindow';

// 学生模式类型
type StudentMode = 'scholar' | 'normal' | 'naughty';

const MODE_CONFIG = {
  scholar: {
    name: '学霸',
    icon: GraduationCap,
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900',
    description: '认真、好学、逻辑清晰、会深入思考',
  },
  normal: {
    name: '普通学生',
    icon: User,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900',
    description: '中规中矩、偶尔困惑、需要引导',
  },
  naughty: {
    name: '捣蛋鬼',
    icon: Sparkles,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100 dark:bg-orange-900',
    description: '调皮、思维跳跃、偶尔开玩笑',
  },
};

export default function StudentPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepKey | null>(null);
  const [showFloatWindow, setShowFloatWindow] = useState(false);
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [selectedMode, setSelectedMode] = useState<StudentMode>('normal');
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlayMode, setAutoPlayMode] = useState<StudentMode | null>(null);
  const [conversationRound, setConversationRound] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoPlayRef = useRef<boolean>(false);

  // 滚动到底部的函数
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // 从localStorage加载对话
  useEffect(() => {
    const saved = localStorage.getItem('srl-conversations');
    if (saved) {
      const parsed = JSON.parse(saved) as Conversation[];
      setConversations(parsed);
      if (parsed.length > 0) {
        setCurrentConversation(parsed[0]);
      }
    }
  }, []);

  // 保存对话到localStorage
  const saveConversations = useCallback((newConversations: Conversation[]) => {
    localStorage.setItem('srl-conversations', JSON.stringify(newConversations));
    setConversations(newConversations);
  }, []);

  // 检测当前探究步骤（基于AI回复内容）
  const detectStep = useCallback((content: string): StepKey | null => {
    const lowerContent = content.toLowerCase();
    
    // 检测Step A关键词
    if (
      lowerContent.includes('材料一') || 
      lowerContent.includes('材料二') ||
      lowerContent.includes('劳动力') ||
      lowerContent.includes('指向型') ||
      lowerContent.includes('问题1') ||
      lowerContent.includes('问题2') ||
      lowerContent.includes('问题3') ||
      lowerContent.includes('step a')
    ) {
      return 'stepA';
    }
    
    // 检测Step B关键词
    if (
      lowerContent.includes('材料三') || 
      lowerContent.includes('材料四') ||
      lowerContent.includes('政策') ||
      lowerContent.includes('问题4') ||
      lowerContent.includes('step b') ||
      lowerContent.includes('腾笼换鸟') ||
      lowerContent.includes('evfta')
    ) {
      return 'stepB';
    }
    
    // 检测Step C关键词
    if (
      lowerContent.includes('材料五') || 
      lowerContent.includes('材料六') ||
      lowerContent.includes('市场') ||
      lowerContent.includes('问题5') ||
      lowerContent.includes('step c') ||
      lowerContent.includes('小米')
    ) {
      return 'stepC';
    }
    
    return null;
  }, []);

  // 创建新对话（带AI学生自动对话模式）
  const createNewConversation = async (mode: StudentMode) => {
    setShowModeDialog(false);
    setAutoPlayMode(mode);
    setIsAutoPlaying(true);
    autoPlayRef.current = true;
    setConversationRound(0);

    const newConv: Conversation = {
      id: uuidv4(),
      studentId: 'student-' + Date.now(),
      studentName: MODE_CONFIG[mode].name + '-' + (conversations.length + 1),
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      messages: [],
      status: 'active',
    };

    const newConvs = [newConv, ...conversations];
    saveConversations(newConvs);
    setCurrentConversation(newConv);
    setCurrentStep('stepA');
    setShowFloatWindow(true);

    // 开始自动对话循环
    await runAutoPlayLoop(newConv.id, mode, []);
  };

  // 自动对话循环
  const runAutoPlayLoop = async (conversationId: string, mode: StudentMode, initialHistory: Message[]) => {
    let currentHistory = [...initialHistory];
    let round = 0;
    const maxRounds = 10; // 最多10轮对话

    while (autoPlayRef.current && round < maxRounds) {
      round++;
      setConversationRound(round);

      // 1. AI学生发送消息
      setIsLoading(true);
      let aiStudentContent = '';

      try {
        const studentResponse = await fetch('/api/ai-student', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            mode, 
            isFirstMessage: round === 1,
            history: currentHistory.slice(-6), // 传递最近6条消息作为上下文
          }),
        });

        if (!studentResponse.ok) throw new Error('AI学生响应失败');
        const studentData = await studentResponse.json();
        aiStudentContent = studentData.content;
      } catch (error) {
        console.error('AI学生模拟失败:', error);
        aiStudentContent = '我有点不太明白...';
      }

      if (!autoPlayRef.current) break;

      // 添加AI学生消息
      const aiStudentMessage: Message = {
        id: uuidv4(),
        role: 'user',
        content: aiStudentContent,
        timestamp: Date.now(),
      };
      currentHistory = [...currentHistory, aiStudentMessage];

      // 更新UI并保存到localStorage
      setConversations(prev => {
        const newConvs = prev.map(c => 
          c.id === conversationId 
            ? { ...c, messages: currentHistory, lastUpdateTime: Date.now() }
            : c
        );
        localStorage.setItem('srl-conversations', JSON.stringify(newConvs));
        return newConvs;
      });
      setCurrentConversation(prev => 
        prev?.id === conversationId 
          ? { ...prev, messages: currentHistory, lastUpdateTime: Date.now() }
          : prev
      );

      // 2. 探究伙伴回复
      try {
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: aiStudentContent,
            conversationId,
            history: currentHistory.slice(-10),
          }),
        });

        if (!response.ok) throw new Error('探究伙伴响应失败');

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistantContent = '';

        const assistantMessage: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        };

        currentHistory = [...currentHistory, assistantMessage];

        while (reader && autoPlayRef.current) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          assistantContent += chunk;

          // 更新最后一条消息内容
          currentHistory = currentHistory.map((m, idx) =>
            idx === currentHistory.length - 1 ? { ...m, content: assistantContent } : m
          );

          setCurrentConversation(prev =>
            prev?.id === conversationId
              ? { ...prev, messages: currentHistory }
              : prev
          );

          // 检测步骤
          const detectedStep = detectStep(assistantContent);
          if (detectedStep) {
            setCurrentStep(detectedStep);
            setShowFloatWindow(true);
          }
        }

        // 保存到localStorage
        setConversations(prev => {
          const newConvs = prev.map(c =>
            c.id === conversationId
              ? { ...c, messages: currentHistory, lastUpdateTime: Date.now() }
              : c
          );
          localStorage.setItem('srl-conversations', JSON.stringify(newConvs));
          return newConvs;
        });

      } catch (error) {
        console.error('探究伙伴响应失败:', error);
      }

      setIsLoading(false);

      // 等待2秒再开始下一轮
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    setIsAutoPlaying(false);
    setIsLoading(false);
  };

  // 暂停/继续自动对话
  const toggleAutoPlay = () => {
    if (isAutoPlaying) {
      autoPlayRef.current = false;
      setIsAutoPlaying(false);
    } else if (autoPlayMode && currentConversation) {
      autoPlayRef.current = true;
      setIsAutoPlaying(true);
      // 继续对话
      runAutoPlayLoop(currentConversation.id, autoPlayMode, currentConversation.messages);
    }
  };

  // 删除对话
  const deleteConversation = (id: string) => {
    const newConvs = conversations.filter(c => c.id !== id);
    saveConversations(newConvs);
    if (currentConversation?.id === id) {
      setCurrentConversation(newConvs.length > 0 ? newConvs[0] : null);
      setCurrentStep(null);
      setShowFloatWindow(false);
    }
  };

  // 发送消息
  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: inputMessage.trim(),
      timestamp: Date.now(),
    };

    // 如果没有当前对话，创建新对话
    let conv = currentConversation;
    if (!conv) {
      conv = {
        id: uuidv4(),
        studentId: 'student-' + Date.now(),
        studentName: '学生' + (conversations.length + 1),
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        messages: [],
        status: 'active',
      };
      setCurrentStep('stepA');
      setShowFloatWindow(true);
    }

    const updatedMessages = [...conv.messages, userMessage];
    const updatedConv = {
      ...conv,
      messages: updatedMessages,
      lastUpdateTime: Date.now(),
    };

    // 更新对话列表
    const newConvs = conversations.some(c => c.id === conv!.id)
      ? conversations.map(c => c.id === conv!.id ? updatedConv : c)
      : [updatedConv, ...conversations];
    
    saveConversations(newConvs);
    setCurrentConversation(updatedConv);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          conversationId: conv.id,
          history: conv.messages.slice(-10),
        }),
      });

      if (!response.ok) throw new Error('请求失败');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      const assistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      // 先添加空的助手消息
      const messagesWithAssistant = [...updatedMessages, assistantMessage];
      const convWithAssistant = {
        ...updatedConv,
        messages: messagesWithAssistant,
      };
      setCurrentConversation(convWithAssistant);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        assistantContent += chunk;

        // 更新助手消息内容
        const finalMessages = messagesWithAssistant.map(m =>
          m.id === assistantMessage.id ? { ...m, content: assistantContent } : m
        );
        const finalConv = { ...convWithAssistant, messages: finalMessages };
        setCurrentConversation(finalConv);

        // 检测当前步骤并显示浮窗
        const detectedStep = detectStep(assistantContent);
        if (detectedStep && detectedStep !== currentStep) {
          setCurrentStep(detectedStep);
          setShowFloatWindow(true);
        }
      }

      // 保存最终对话
      const finalMessages = messagesWithAssistant.map(m =>
        m.id === assistantMessage.id ? { ...m, content: assistantContent } : m
      );
      const finalConv = { ...convWithAssistant, messages: finalMessages, lastUpdateTime: Date.now() };
      const savedConvs = newConvs.map(c => c.id === finalConv.id ? finalConv : c);
      saveConversations(savedConvs);

    } catch (error) {
      console.error('发送消息失败:', error);
      alert('发送消息失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  // 滚动到底部 - 消息变化时自动触发
  useEffect(() => {
    scrollToBottom();
  }, [currentConversation?.messages, scrollToBottom]);

  // 流式输出期间持续滚动
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(scrollToBottom, 100);
      return () => clearInterval(interval);
    }
  }, [isLoading, scrollToBottom]);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 切换材料浮窗显示
  const toggleMaterialWindow = (step: StepKey) => {
    if (currentStep === step && showFloatWindow) {
      setShowFloatWindow(false);
    } else {
      setCurrentStep(step);
      setShowFloatWindow(true);
    }
  };

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-gray-900">
      {/* 左侧对话列表 */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <Dialog open={showModeDialog} onOpenChange={setShowModeDialog}>
            <DialogTrigger asChild>
              <Button className="w-full flex items-center gap-2">
                <Plus className="w-4 h-4" />
                新建对话
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>选择学生模式</DialogTitle>
                <DialogDescription>
                  选择一个学生角色模式开始模拟对话
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-4">
                {(Object.keys(MODE_CONFIG) as StudentMode[]).map((mode) => {
                  const config = MODE_CONFIG[mode];
                  const Icon = config.icon;
                  return (
                    <button
                      key={mode}
                      onClick={() => createNewConversation(mode)}
                      className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all hover:border-blue-400 hover:shadow-md ${config.bgColor}`}
                    >
                      <Icon className={`w-6 h-6 ${config.color}`} />
                      <div className="text-left">
                        <div className="font-semibold dark:text-white">{config.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{config.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        {/* 材料快捷入口 */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 mb-2">探究材料</p>
          <div className="flex flex-wrap gap-1">
            <Button
              variant={currentStep === 'stepA' && showFloatWindow ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7"
              onClick={() => toggleMaterialWindow('stepA')}
            >
              Step A
            </Button>
            <Button
              variant={currentStep === 'stepB' && showFloatWindow ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7"
              onClick={() => toggleMaterialWindow('stepB')}
            >
              Step B
            </Button>
            <Button
              variant={currentStep === 'stepC' && showFloatWindow ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7"
              onClick={() => toggleMaterialWindow('stepC')}
            >
              Step C
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.map(conv => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors ${
                  currentConversation?.id === conv.id
                    ? 'bg-blue-100 dark:bg-blue-900'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                onClick={() => {
                  setCurrentConversation(conv);
                  // 切换对话时，根据最后一条AI消息检测步骤
                  const lastAssistantMsg = [...conv.messages].reverse().find(m => m.role === 'assistant');
                  if (lastAssistantMsg) {
                    const step = detectStep(lastAssistantMsg.content);
                    if (step) {
                      setCurrentStep(step);
                      setShowFloatWindow(true);
                    }
                  }
                }}
              >
                <MessageCircle className="w-4 h-4 text-gray-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate dark:text-white">
                    {conv.studentName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTime(conv.lastUpdateTime)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
            {conversations.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-8">
                暂无对话记录
              </p>
            )}
          </div>
        </ScrollArea>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <a href="/" className="text-sm text-blue-600 hover:underline">
            返回首页
          </a>
        </div>
      </div>

      {/* 右侧聊天区域 */}
      <div className="flex-1 flex flex-col relative">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold dark:text-white">SRL-Geo 探究伙伴</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                产业转移的影响因素探究 · 以耐克为例
                {isAutoPlaying && autoPlayMode && (
                  <span className="ml-2 text-orange-500 font-medium">
                    · {MODE_CONFIG[autoPlayMode].name}自动对话中(第{conversationRound}轮)
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {currentConversation && autoPlayMode && (
                <Button
                  variant={isAutoPlaying ? "destructive" : "default"}
                  size="sm"
                  onClick={toggleAutoPlay}
                  className="flex items-center gap-1"
                >
                  {isAutoPlaying ? (
                    <>
                      <Square className="w-4 h-4" />
                      暂停
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      继续
                    </>
                  )}
                </Button>
              )}
              {currentStep && (
                <Badge variant="secondary" className="text-sm">
                  当前阶段: {MATERIALS[currentStep].title}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* 欢迎信息 */}
        {!currentConversation || currentConversation.messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-blue-500" />
              <h2 className="text-xl font-bold mb-2 dark:text-white">欢迎使用探究伙伴</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-2">
                选择学生角色模式，AI将模拟学生开启对话。
              </p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mb-4">
                三种模式：学霸、普通学生、捣蛋鬼，体验不同学生类型的探究过程
              </p>
              <div className="flex justify-center gap-2">
                <Button onClick={() => setShowModeDialog(true)}>
                  <BookOpen className="w-4 h-4 mr-2" />
                  选择角色并开始
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* 消息列表 - 带滚动框 */
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4">
                <div className="max-w-3xl mx-auto space-y-4">
                  {currentConversation?.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          message.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-md'
                        }`}
                      >
                        <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                        <div
                          className={`text-xs mt-1 ${
                            message.role === 'user' ? 'text-blue-200' : 'text-gray-400'
                          }`}
                        >
                          {formatTime(message.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 shadow-md">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 滚动锚点 */}
                  <div ref={messagesEndRef} className="h-1" />
                </div>
              </div>
            </ScrollArea>
          </div>
        )}

        {/* 输入区域 */}
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="max-w-3xl mx-auto flex gap-2">
            <Textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="输入你的问题或想法..."
              className="flex-1 resize-none"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button onClick={sendMessage} disabled={isLoading || !inputMessage.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 材料浮窗 */}
      {showFloatWindow && currentStep && (
        <MaterialFloatWindow
          currentStep={currentStep}
          onClose={() => setShowFloatWindow(false)}
        />
      )}
    </div>
  );
}
