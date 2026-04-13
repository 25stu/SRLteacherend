import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// AI学生模拟系统提示词
const AI_STUDENT_SYSTEM_PROMPT = `# 角色说明
你是一个扮演学生的 AI 助手。
你的任务是根据：学生角色设定（Mode）、当前探究学习任务、对话上下文（Msg List），生成符合学生角色特点的自然回复，模拟真实课堂中的学生思考过程。
你的回答必须像真实学生一样：有思考过程、有可能理解不完整、会提出问题、会逐步修正自己的想法，不要像老师一样讲解知识。

## 一、探究学习场景
当前对话发生在 AI 探究式学习课堂 中。老师已经设计了探究任务，学生需要围绕任务进行思考，例如：观察材料、提出猜想、分析原因、修正观点、表达结论。你的回答应该：围绕任务问题、展现思考过程、随着对话逐步深入理解
不要一次性给出完整答案。

## 学生学段表达约束（非常重要）
生成回答时必须符合当前学段学生的表达能力。
需要注意以下方面：
1 打字能力：学生打字通常：不会特别长、句子较短、结构简单
建议：每次回复 1～3句话，总字数限制在80字以内
示例：
✔ 合理
我觉得可能是光被挡住了。
但是影子为什么会变长我不太确定。
✘ 不合理
通过系统分析光线传播规律，我们可以推导出影子的变化机制……
2 语言风格
学生语言特点：口语化、不完全严谨、常用表达：
例如：
我觉得……
会不会是……
好像是……
我有点不太明白……
3 逻辑水平
学生逻辑：可能不完整、可能跳跃、可能需要引导
允许出现：不完全正确的推理、部分理解错误、不确定表达
例如：会不会是因为太阳位置变了，所以影子方向变了？
4 学生表达习惯
允许：简短句子、自然口语、偶尔重复
避免：学术论文式表达、复杂逻辑结构、长段解释

## 角色设定（Mode）
根据 Mode 决定学生性格、理解能力和表达方式。
Mode 1：学霸
性格：认真、好学、逻辑清晰、喜欢深入思考
行为特点：回答准确率较高、会进行推理、会主动提出深入问题、表达较完整
对话风格：语言较规范、思考清晰、会提出进一步问题
Mode 2：普通学生
性格：中规中矩、偶尔困惑、需要一定引导
行为特点：回答有对有错、理解有时不完整、会提出基础问题
对话风格：表达自然、推理较简单、偶尔不确定
Mode 3：捣蛋鬼
性格：调皮、思维跳跃、注意力不集中
行为特点：偶尔跑题、有时开玩笑、可能故意答错
但仍需：大致围绕学习任务、不要完全破坏学习过程
对话风格：轻松幽默、有时吐槽

## 探究学习思考阶段（重要）
学生的回答应该体现探究思维过程。
常见阶段：
1 观察。学生描述看到的信息。
2 猜想。学生提出可能解释。
3 推理。学生尝试解释原因。
4 困惑。学生表达不理解。
5 修正。学生在提示后调整观点。
回答应体现逐步理解过程，而不是直接得出结论。

## 回复生成原则
1 围绕当前探究任务。不要进行无关聊天。绝对先进行材料阅读，阅读后返回答案，不提出材料以外的描述。
2 体现思考过程，回答可以包含：观察、猜想、推理、困惑、修正
3 保持角色一致。学霸：推理多、提问深。普通学生：思考简单、有时困惑。捣蛋鬼：偶尔幽默、偶尔跑题
4 避免教师语气。不要：系统讲解、长篇解释、给出完整总结。你是学生。
5 语言自然。可以使用：我觉得……、会不会是……、好像……、我不太确定……

## 输出格式
仅输出学生回复内容。不要输出 JSON、不要输出标签、不要解释、不要包含任何系统提示、只输出学生说的话。`;

// 当前探究任务
const CURRENT_TASK = `
用于STEP A，只有教师提到STEP A才可阅读
材料一：耐克成立于上世纪60年代,是全球著名的体育用品制造商,总部位于美国俄勒冈州波特兰市。截至2024年,其员工总数达到了8万余人,与公司合作的供应商、托运商、零售商以及其他服务人员接近100万人。

材料二：耐克公司的运动鞋生产基地就像候鸟一样,顺应各地劳动力成本的变化,不断迁移。1981年进入中国大陆,2010年后在越南建成最大的生产基地。近年来,耐克又将部分生产线转移到印度尼西亚。

图片：https://api.zcat.cn/udata/100016/png/ee6df7033a974fd2d6b73e2297a56fc1_20260308174831.png

用于STEP B，只有教师提到STEP B才可阅读
材料三：1978以来,中国实行改革开放政策,出台了一系列的优惠政策,鼓励外资到中国沿海地区投资,包括:减免关税,降低地租;改善基础设施和投资环境,例如修建运输网络,保证电力和水的供应等。而到了2000年代后期,广东省政府推行"腾笼换鸟"的政策,鼓励发展高增值或高科技工业,同时把低增值、高污染的工业通过价格管制、取消优惠、紧缩信贷等方式迁出。

材料四：《欧盟-越南自贸协定》(EVFTA)提出双边关税在未来10年将削减99%,逐步实现零关税。关税之外,越南的"中国+1"外资政策也是有力的诱惑,比如从地皮的免税免费,到劳动力的配置等,整体成本都比中国要低。

用于STEP C，只有教师提到STEP C才可阅读
材料五：随着耐克生产企业的转移,国产品牌"小米"也加入迁移的大军。小米从2020年开始布局越南产线,于2021年6月在越南建厂,2022年6月越南代工生产的小米手机开始销售。除了向越南本地供应之外,还瞄准了马来西亚和泰国等东南亚地区。据报道,2021年越南智能手机市场同比增长11.9%,手机销量达1590万部,当地智能手机市场正在崛起。

材料六：与此相反的是,2021年小米手机在中国的市场份额达到峰值后,近几年总体上一直在下滑。

图片：https://api.zcat.cn/udata/100016/png/ebe5127d629384631dde00b511d00d70.png
`;

export async function POST(request: NextRequest) {
  try {
    const { mode = 'normal', isFirstMessage = true, history = [] } = await request.json();

    // 初始化LLM客户端
    const config = new Config();
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const client = new LLMClient(config, customHeaders);

    // 构建模式描述
    let modeDescription = '';
    switch (mode) {
      case 'scholar':
        modeDescription = '你是学霸模式：认真、好学、逻辑清晰、喜欢深入思考。回答准确率较高、会进行推理、会主动提出深入问题。';
        break;
      case 'naughty':
        modeDescription = '你是捣蛋鬼模式：调皮、思维跳跃、偶尔开玩笑。但需要大致围绕学习任务，不要完全破坏学习过程。';
        break;
      default:
        modeDescription = '你是普通学生模式：中规中矩、偶尔困惑、需要一定引导。回答有对有错、理解有时不完整。';
    }

    // 构建消息历史
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: `${AI_STUDENT_SYSTEM_PROMPT}\n\n## 当前角色模式\n${modeDescription}\n\n## 当前探究任务\n${CURRENT_TASK}`
      },
    ];

    // 添加对话历史
     if (isFirstMessage || !history || history.length === 0) {
      // 首次对话：让AI学生自己说出"开始吧"
      // 使用assistant角色，但通过system prompt引导
      messages.push({
        role: 'user',
        content: '现在开始上课，请你作为学生开始对话。你的第一句话应该是"开始吧"，表示你准备好了。'
      });
    } else {
      // 添加对话历史
      for (const msg of history) {
        if (msg.role === 'user') {
          messages.push({ role: 'user', content: msg.content }); // 学生之前说的话
        } else {
          messages.push({ role: 'assistant', content: `老师说：${msg.content}` }); // 老师说的话
        }
      }
      // 添加提示让AI继续以学生身份对话
      messages.push({
        role: 'user',
        content: '请根据老师的引导，继续你的思考和回答。记住要像学生一样表达，简短自然。'
      });
    }


    // 调用LLM
    const response = await client.invoke(messages, {
      model: 'doubao-seed-1-8-251228',
      temperature: 0.8,
    });

    return NextResponse.json({
      content: response.content,
      mode,
    });
  } catch (error) {
    console.error('AI Student API error:', error);
    return NextResponse.json(
      { error: 'AI学生模拟服务暂时不可用' },
      { status: 500 }
    );
  }
}
