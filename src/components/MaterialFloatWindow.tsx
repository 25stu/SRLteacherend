'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Minimize2, Move, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// 材料项类型
interface MaterialItem {
  name: string;
  content: string;
}

interface MaterialImage {
  url: string;
  caption: string;
}

interface MaterialStep {
  title: string;
  materials: MaterialItem[];
  image?: MaterialImage;
  questions: string[];
}

// 材料数据
export const MATERIALS: Record<StepKey, MaterialStep> = {
  stepA: {
    title: 'Step A: 劳动力因素',
    materials: [
      {
        name: '材料一',
        content: '耐克成立于上世纪60年代,是全球著名的体育用品制造商,总部位于美国俄勒冈州波特兰市。截至2024年,其员工总数达到了8万余人,与公司合作的供应商、托运商、零售商以及其他服务人员接近100万人。',
      },
      {
        name: '材料二',
        content: '耐克公司的运动鞋生产基地就像候鸟一样,顺应各地劳动力成本的变化,不断迁移。1981年进入中国大陆,2010年后在越南建成最大的生产基地。近年来,耐克又将部分生产线转移到印度尼西亚。',
      },
    ],
    image: {
      url: 'https://api.zcat.cn/udata/100016/png/ee6df7033a974fd2d6b73e2297a56fc1_20260308174831.png',
      caption: '耐克生产基地2005-2015产业转移份额的变化和劳动力成本对比图',
    },
    questions: [
      '问题1: 耐克生产企业属于哪种指向型的产业?',
      '问题2: 读图和图例,说明美国耐克牌运动鞋2005-2015在亚太地区产业转移份额的变化。',
      '问题3: 解释这种变化的原因。',
    ],
  },
  stepB: {
    title: 'Step B: 政策因素',
    materials: [
      {
        name: '材料三',
        content: '1978以来,中国实行改革开放政策,出台了一系列的优惠政策,鼓励外资到中国沿海地区投资,包括:减免关税,降低地租;改善基础设施和投资环境,例如修建运输网络,保证电力和水的供应等。而到了2000年代后期,广东省政府推行"腾笼换鸟"的政策,鼓励发展高增值或高科技工业,同时把低增值、高污染的工业通过价格管制、取消优惠、紧缩信贷等方式迁出。',
      },
      {
        name: '材料四',
        content: '《欧盟-越南自贸协定》(EVFTA)提出双边关税在未来10年将削减99%,逐步实现零关税。关税之外,越南的"中国+1"外资政策也是有力的诱惑,比如从地皮的免税免费,到劳动力的配置等,整体成本都比中国要低。',
      },
    ],
    questions: [
      '问题4: 结合材料说明政策如何影响产业转移?',
    ],
  },
  stepC: {
    title: 'Step C: 市场因素',
    materials: [
      {
        name: '材料五',
        content: '随着耐克生产企业的转移,国产品牌"小米"也加入迁移的大军。小米从2020年开始布局越南产线,于2021年6月在越南建厂,2022年6月越南代工生产的小米手机开始销售。除了向越南本地供应之外,还瞄准了马来西亚和泰国等东南亚地区。据报道,2021年越南智能手机市场同比增长11.9%,手机销量达1590万部,当地智能手机市场正在崛起。',
      },
      {
        name: '材料六',
        content: '与此相反的是,2021年小米手机在中国的市场份额达到峰值后,近几年总体上一直在下滑。',
      },
    ],
    image: {
      url: 'https://api.zcat.cn/udata/100016/png/ebe5127d629384631dde00b511d00d70.png',
      caption: '小米市场份额变化图',
    },
    questions: [
      '问题5: 结合材料说明市场因素如何影响产业转移?',
    ],
  },
};

export type StepKey = 'stepA' | 'stepB' | 'stepC';

interface MaterialFloatWindowProps {
  currentStep: StepKey | null;
  onClose: () => void;
}

export default function MaterialFloatWindow({ currentStep, onClose }: MaterialFloatWindowProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  // 获取当前步骤的材料
  const currentMaterial = currentStep ? MATERIALS[currentStep] : null;

  // 处理拖动
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 200, e.clientY - dragOffset.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // 切换步骤时重置位置
  useEffect(() => {
    setPosition({ x: 20, y: 80 });
    setIsMinimized(false);
  }, [currentStep]);

  if (!currentStep || !currentMaterial) return null;

  return (
    <>
      {/* 最小化状态 - 显示为悬浮按钮 */}
      {isMinimized ? (
        <button
          onClick={() => setIsMinimized(false)}
          className="fixed z-50 w-14 h-14 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-200 flex items-center justify-center group"
          style={{
            left: position.x,
            top: position.y,
          }}
          title="点击展开材料"
        >
          <BookOpen className="w-6 h-6" />
          {/* 悬停提示 */}
          <div className="absolute right-full mr-3 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            {currentMaterial.title}
            <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-gray-900" />
          </div>
        </button>
      ) : (
        /* 展开状态 - 完整浮窗 */
        <div
          ref={windowRef}
          className={`fixed z-50 transition-all duration-200 ${
            isDragging ? 'cursor-grabbing' : ''
          }`}
          style={{
            left: position.x,
            top: position.y,
            width: '380px',
            maxWidth: 'calc(100vw - 40px)',
          }}
        >
          <Card className="shadow-2xl border-2 border-blue-200 dark:border-blue-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm">
            {/* 标题栏 - 可拖动 */}
            <CardHeader 
              className="p-3 cursor-grab active:cursor-grabbing select-none bg-gradient-to-r from-blue-500 to-indigo-500 rounded-t-lg"
              onMouseDown={handleMouseDown}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  {currentMaterial.title}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-white/80 hover:text-white hover:bg-white/20"
                    onClick={() => setIsMinimized(true)}
                    title="最小化"
                  >
                    <Minimize2 className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-white/80 hover:text-white hover:bg-white/20"
                    onClick={onClose}
                    title="关闭"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            {/* 内容区域 */}
            <CardContent className="p-4 max-h-[60vh] overflow-y-auto">
              {/* 材料内容 */}
              <div className="space-y-4">
                {currentMaterial.materials.map((material, index) => (
                  <div key={index} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <h4 className="font-semibold text-sm text-blue-600 dark:text-blue-400 mb-2">
                      {material.name}
                    </h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      {material.content}
                    </p>
                  </div>
                ))}

                {/* 图片 */}
                {currentMaterial.image && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <img
                      src={currentMaterial.image.url}
                      alt={currentMaterial.image.caption}
                      className="w-full rounded border"
                      loading="lazy"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                      {currentMaterial.image.caption}
                    </p>
                  </div>
                )}

                {/* 问题提示 */}
                <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3 border border-blue-200 dark:border-blue-700">
                  <h4 className="font-semibold text-sm text-blue-700 dark:text-blue-300 mb-2">
                    📋 探究问题
                  </h4>
                  <ul className="space-y-1">
                    {currentMaterial.questions.map((q, index) => (
                      <li key={index} className="text-sm text-gray-700 dark:text-gray-300">
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* 拖动提示 */}
              <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center gap-1 text-xs text-gray-400">
                <Move className="w-3 h-3" />
                <span>拖动标题栏可移动窗口</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
