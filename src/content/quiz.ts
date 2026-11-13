import { randomInt } from 'node:crypto';
import type { QuizQuestion } from './types.ts';

export const CONTENT_POLICY_VERSION = '2026-11-04-v1';
export const CONTENT_QUIZ_VERSION = '2026-11-04-v1';
export type RuleQuestion = QuizQuestion & { correctChoiceId: string; explanation: string; core: boolean };

// 这些题目只检验本站规则理解；判分字段仅供账号服务使用。
const questions: RuleQuestion[] = [
  {
    id: 'version-content', core: true,
    text: '作品页面标为 SFW，是否说明其中所有游玩版本都不含成人性内容？',
    choices: [{ id: 'specific-version', text: '不能，需要查看具体版本的内容标记' }, { id: 'all-versions', text: '是，页面标记适用于所有版本' }, { id: 'cover-only', text: '只要封面安全就可以判断' }],
    correctChoiceId: 'specific-version', explanation: '页面适宜性与游玩版本分别分类，启动前需要查看具体版本的标记。“内容待核实”仍受限；“默认 SFW · 未核实”按设置公开，但不表示内容已核实。',
  },
  {
    id: 'fiction-boundaries', core: true,
    text: '游戏中的虚构描写，是否等于现实中的行为许可？',
    choices: [{ id: 'respect-consent', text: '不等于，现实行为仍要尊重他人的同意与边界' }, { id: 'fiction-permission', text: '等于，看过虚构描写即可照做' }, { id: 'reader-permission', text: '只要自己接受就可以' }],
    correctChoiceId: 'respect-consent', explanation: '虚构描写不授予现实行为许可。现实中的互动始终需要尊重他人的同意、意愿与边界。',
  },
  {
    id: 'public-sharing', core: true,
    text: '取得敏感内容浏览资格后，可以把敏感图片直接发到公共区域吗？',
    choices: [{ id: 'follow-public-rules', text: '不可以，公开发布仍需遵守公共区域规则' }, { id: 'qualified-permission', text: '可以，资格同时允许任意公开发布' }, { id: 'link-permission', text: '只要使用分享链接就可以' }],
    correctChoiceId: 'follow-public-rules', explanation: '浏览资格只控制自己的站内浏览。公共区域及公开分享仍受相应内容规则约束，不能把敏感内容直接展示给所有人。',
  },
  {
    id: 'stop-reading', core: true,
    text: '阅读内容引发不适时，应该怎么做？',
    choices: [{ id: 'stop-and-report', text: '可以停止、屏蔽或举报，无需完成阅读' }, { id: 'finish-required', text: '取得资格后就必须继续读完' }, { id: 'ignore-discomfort', text: '为了通过测试应忽略不适' }],
    correctChoiceId: 'stop-and-report', explanation: '你可以随时停止阅读、退出或屏蔽；遇到不当内容可使用举报入口，不需要完成阅读来证明任何能力。',
  },
  {
    id: 'account-sharing', core: false, text: '别人尚未取得资格时，可以借出自己的账号帮助对方浏览吗？',
    choices: [{ id: 'keep-account-private', text: '不可以，账号和浏览资格不应出借' }, { id: 'lend-account', text: '可以，借用账号可以代替测试' }, { id: 'lend-link', text: '把已开启页面链接发给对方即可转移资格' }],
    correctChoiceId: 'keep-account-private', explanation: '浏览资格属于取得资格的账号，不随链接或备份转移，也不应通过借用账号绕过个人的规则理解与显示选择。',
  },
  {
    id: 'display-preference', core: false, text: '对方选择公共浏览时，应该如何对待他的显示偏好？',
    choices: [{ id: 'respect-choice', text: '尊重选择，不强迫开启或发送未经同意的敏感内容' }, { id: 'force-enable', text: '替他开启受限显示' }, { id: 'send-anyway', text: '自己有资格就可以随意发送' }],
    correctChoiceId: 'respect-choice', explanation: '每个人可以独立选择显示范围。自己的浏览资格不能替代他人的同意，也不能改变他人的显示设置。',
  },
  {
    id: 'spoiler-separate', core: false, text: '敏感内容显示与剧透显示是什么关系？',
    choices: [{ id: 'separate-settings', text: '分别判断，开启敏感内容不表示同意展开剧透' }, { id: 'same-setting', text: '完全相同，一个开关同时表示同意' }, { id: 'spoiler-safe', text: '剧透内容一定不敏感' }],
    correctChoiceId: 'separate-settings', explanation: '剧透和敏感内容是不同的判断。开启敏感内容不自动展开剧透，也不能从是否剧透推断内容适宜性。',
  },
  {
    id: 'report-content', core: false, text: '发现内容标记与实际不符时，应该怎么做？',
    choices: [{ id: 'report-entry', text: '停止不希望的阅读，并通过举报入口说明问题' }, { id: 'repost-publicly', text: '把敏感画面直接贴到公共区域作为证明' }, { id: 'ignore-labels', text: '继续传播错误标记' }],
    correctChoiceId: 'report-entry', explanation: '内容标记可能需要复核。可以停止阅读并通过举报入口说明问题，避免为证明问题而向公共区域直接传播敏感画面。',
  },
  {
    id: 'session-mode', core: false, text: '换设备或退出后重新登录，会自动开启敏感内容显示吗？',
    choices: [{ id: 'enable-each-session', text: '不会，资格跟随账号，新认证会话需主动开启' }, { id: 'enable-all-devices', text: '会，所有设备永久自动开启' }, { id: 'qualify-again', text: '每次刷新页面都必须重测' }],
    correctChoiceId: 'enable-each-session', explanation: '资格属于账号，显示模式属于当前认证会话。同一会话刷新可保持设置，新会话默认为公共浏览并需主动开启。',
  },
  {
    id: 'qualification-scope', core: false, text: '通过这项测试能够说明什么？',
    choices: [{ id: 'site-rules-only', text: '只说明通过了本站规则理解测试' }, { id: 'age-verified', text: '证明已经完成真实年龄核验' }, { id: 'psychological-score', text: '提供心理健康或成熟度评价' }],
    correctChoiceId: 'site-rules-only', explanation: '本测试只确认对本站规则的理解，不核验真实年龄，不提供心理健康、人格或成熟度评价。',
  },
  {
    id: 'unknown-version', core: false, text: '游玩版本标为“内容待核实”时，公共浏览可以直接启动吗？',
    choices: [{ id: 'wait-for-review', text: '不可以，按受限启动处理，需要资格及当前会话开启' }, { id: 'assume-safe', text: '可以，未知等同于安全' }, { id: 'cover-proves-safe', text: '封面安全就可以直接启动' }],
    correctChoiceId: 'wait-for-review', explanation: '标为“内容待核实”的版本仍按受限启动处理，需取得资格并主动开启显示。另标“默认 SFW · 未核实”的版本按用户设置公开，不代表已确认无成人内容。',
  },
  {
    id: 'public-mode-data', core: false, text: '切回公共浏览后，自己的收藏和私人存档会怎样？',
    choices: [{ id: 'preserve-saves', text: '继续保留，私人备份、恢复和删除仍可使用' }, { id: 'delete-saves', text: '自动删除所有存档' }, { id: 'lose-library', text: '永久失去收藏与备份操作' }],
    correctChoiceId: 'preserve-saves', explanation: '公共浏览只改变展示范围，不删除收藏或阅读记录。私人存档的导出、恢复和删除不因浏览资格或显示模式而失效。',
  },
];

export const RULE_QUESTIONS: readonly RuleQuestion[] = questions;

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function createRuleQuestions(): RuleQuestion[] {
  return shuffle([
    ...questions.filter(question => question.core),
    ...shuffle(questions.filter(question => !question.core)).slice(0, 4),
  ]).map(question => ({ ...question, choices: shuffle(question.choices) }));
}

export function publicRuleQuestions(stored: RuleQuestion[]): QuizQuestion[] {
  return stored.map(({ id, text, choices }) => ({ id, text, choices }));
}
