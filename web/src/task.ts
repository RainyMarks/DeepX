import type { ContributionType, TaskId } from "./types";

/**
 * Research directions in fixed display order. The order is also the
 * categorical colour slot order (see --task-N in styles.css), which was
 * validated for colour-vision-deficiency separation between neighbours.
 */
export const TASK_ORDER: TaskId[] = [
  "synthetic_detection",
  "source_attribution",
  "deepfake_detection",
  "image_forgery",
  "scene_text_forgery",
  "content_provenance",
  "image_steganalysis",
  "digital_watermarking",
];

export const TASKS: Record<TaskId, { label: string; short: string; description: string; color: string }> = {
  synthetic_detection: { label: "生成/合成图像检测", short: "生成检测", description: "判别图像是否由 GAN、扩散模型等生成", color: "var(--task-1)" },
  source_attribution: { label: "生成来源归因与验证", short: "来源归因", description: "追溯生成模型、指纹与模型来源", color: "var(--task-2)" },
  deepfake_detection: { label: "深度伪造与人脸操纵", short: "深度伪造", description: "换脸、表情操纵与人脸合成检测", color: "var(--task-3)" },
  image_forgery: { label: "图像篡改检测与定位", short: "图像篡改", description: "拼接、复制移动、修补的检测与像素级定位", color: "var(--task-4)" },
  scene_text_forgery: { label: "场景文本图像伪造", short: "场景文本", description: "文档、票据与场景文字的篡改取证", color: "var(--task-5)" },
  content_provenance: { label: "内容凭证与水印验证", short: "内容凭证", description: "C2PA 内容凭证、生成水印与来源验证", color: "var(--task-6)" },
  image_steganalysis: { label: "图像隐写与隐写分析", short: "隐写分析", description: "空域/JPEG 隐写及其检测", color: "var(--task-7)" },
  digital_watermarking: { label: "数字图像水印与认证", short: "图像水印", description: "鲁棒/脆弱水印与图像内容认证", color: "var(--task-8)" },
};

export const CONTRIBUTIONS: Record<ContributionType, string> = {
  method: "方法", dataset: "数据集", benchmark: "基准", survey: "综述", analysis: "分析研究",
};

export const VENUE_TYPES: Record<string, string> = {
  journal: "期刊", conference: "会议", preprint: "预印本", book: "图书/章节", unknown: "未标注",
};

export const SOURCES: Record<string, string> = {
  openalex: "OpenAlex", crossref: "Crossref", arxiv: "arXiv", semantic_scholar: "Semantic Scholar",
  dblp: "DBLP", authorized_seed: "授权种子数据",
};

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["zh-CN"], { type: "region" });
  } catch {
    return null;
  }
})();

/** Chinese display name for an ISO country code, falling back to the source name. */
export function countryName(code: string, fallback = ""): string {
  if (code && regionNames) {
    try {
      const name = regionNames.of(code.toUpperCase());
      if (name && name !== code.toUpperCase()) return name;
    } catch {
      // Invalid code: use the source name below.
    }
  }
  return fallback || code;
}
