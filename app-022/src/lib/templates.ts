/**
 * 内置模板库（对应需求文档 §9）。点击模板 → 生成字帖草稿并进入编辑器。
 */
import type { Layout, Worksheet } from '../types';
import { defaultLayout } from './layout';
import { newId } from './storage';

export type Template = {
  id: string;
  name: string;
  desc: string;
  title: string;
  /** 字符集合（生成时逐字拆分；拼音模板可含带调字母） */
  chars: string;
  /** 是否直接按字符拆分（不做汉字/字母过滤），用于拼音带调字母 */
  raw?: boolean;
  layoutPatch?: Partial<Layout>;
};

export const TEMPLATES: Template[] = [
  {
    id: 'grade1',
    name: '一年级上册生字表',
    desc: '常用基础生字 100 字，按笔画数排列',
    title: '一年级生字表',
    chars: '一二三四五六七八九十人口手足耳目日月水火山石田土禾木马虫鱼肉鸟竹米谷风云电天地上下大小多少长短高矮进出开关来去坐立走飞',
  },
  {
    id: 'poems',
    name: '古诗临写 · 静夜思/悯农/咏鹅',
    desc: '三首必背古诗全集字',
    title: '古诗临写',
    chars: '床前明月光疑是地上霜举头望故乡低思故静夜李白锄禾日当午汗滴下土谁盘中餐粒皆辛苦鹅鹅曲项向天歌白毛浮绿水红掌拨清波骆宾王李绅',
  },
  {
    id: 'name',
    name: '姓名练习',
    desc: '常用姓名用字，大格多描红',
    title: '姓名练习',
    chars: '王芳李伟张敏刘洋陈静杨勇赵磊黄丽周杰吴娜徐强孙丽马涛朱婷胡军郭燕何平高翔林峰罗兰郑爽',
    layoutPatch: {
      cellMm: 25,
      perLine: 8,
      mix: { model: 1, strokeSteps: 3, trace: 4, blank: 2 },
    },
  },
  {
    id: 'abc',
    name: '英语字母与数字',
    desc: 'A-Z a-z 0-9，横线格字体回退可描红',
    title: '英语字母数字',
    chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    layoutPatch: {
      grid: 'line',
      cellMm: 16,
      perLine: 12,
      mix: { model: 1, strokeSteps: 0, trace: 3, blank: 3 },
    },
  },
  {
    id: 'pinyin',
    name: '拼音四线格',
    desc: '声母韵母与带调字母，四线格练习',
    title: '拼音练习',
    raw: true,
    chars: 'bpmfdtnlgkhjqxzhchshrzcsywāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜü',
    layoutPatch: {
      grid: 'line',
      fourLine: true,
      cellMm: 20,
      perLine: 10,
      mix: { model: 1, strokeSteps: 0, trace: 2, blank: 3 },
    },
  },
];

/** 由模板创建字帖草稿（不写入 storage，由编辑器首次自动保存） */
export function worksheetFromTemplate(t: Template): Worksheet {
  const chars = [...t.chars];
  return {
    id: newId(),
    title: t.title,
    chars,
    layout: { ...defaultLayout, ...t.layoutPatch },
    pages: 0,
    updatedAt: Date.now(),
    sortByStrokes: false,
  };
}
