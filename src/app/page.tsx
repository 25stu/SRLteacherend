'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BookOpen } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            SRL 地理探究智能体
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            基于自我调节学习理论的地理探究学习分析平台
          </p>
        </div>

        {/* Teacher Card */}
        <div className="max-w-md mx-auto">
          <Link href="/teacher" className="group">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-8 border-2 border-transparent hover:border-indigo-500 dark:hover:border-indigo-400">
              <div className="flex items-center justify-center w-16 h-16 bg-indigo-100 dark:bg-indigo-900 rounded-full mb-6 group-hover:scale-110 transition-transform mx-auto">
                <BookOpen className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3 text-center">
                教师端
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4 text-center">
                查看学生对话记录，分析学生元认知表现，生成学习报告
              </p>
              <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                  浏览所有学生对话记录
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                  分析学生元认知编码
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                  生成可视化评价报告
                </li>
              </ul>
              <Button className="w-full mt-6">
                进入教师端
              </Button>
            </div>
          </Link>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-gray-500 dark:text-gray-400 text-sm">
          <p>基于 SRL（自我调节学习）理论的智能教学系统</p>
        </div>
      </div>
    </div>
  );
}