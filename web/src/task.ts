import type { TaskId } from "./types";

export const TASKS: Record<TaskId, { label: string; short: string; color: string }> = {
  synthetic_detection: { label: "生成/合成图像检测", short: "生成检测", color: "#c44b32" },
  source_attribution: { label: "生成来源归因与验证", short: "来源归因", color: "#1b7180" },
  deepfake_detection: { label: "深度伪造与人脸操纵", short: "深度伪造", color: "#825a96" },
  image_forgery: { label: "图像篡改检测与定位", short: "图像篡改", color: "#b07a23" },
  scene_text_forgery: { label: "场景文本图像伪造", short: "场景文本", color: "#2d7561" },
  content_provenance: { label: "内容凭证与水印验证", short: "内容凭证", color: "#4c6692" },
};

export const CONTRIBUTIONS: Record<string, string> = {
  method: "方法", dataset: "数据集", benchmark: "基准", survey: "综述", analysis: "分析研究",
};
