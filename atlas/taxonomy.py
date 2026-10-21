"""Scope and research-direction classification for image-forensics papers.

Every decision is made from explicit wording, in this order:

1. Records that are not papers (figure/table DOIs, errata) and topics in other
   modalities (audio, video-only, text-only, 3-D, databases, neural-network
   IP) are rejected.
2. Off-topic subjects that share vocabulary with image forensics (OCR text
   localisation, biometric fingerprints, camera/device identification,
   malware and disk forensics, physical forensics, SAR imagery) are rejected
   unless the title also states an image-forensics task.
3. Each research direction has title rules that name the task explicitly
   (e.g. "AI-generated image detection", "copy-move", "steganalysis"). A paper
   is in scope when at least one direction matches its title. Papers with an
   opaque method name are admitted only when the title still hints at a
   forensic task and the abstract states the task explicitly.

There is no catch-all direction: a paper that names no task is out of scope.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

TASK_LABELS = {
    "synthetic_detection": "生成/合成图像检测",
    "source_attribution": "生成来源归因与验证",
    "deepfake_detection": "深度伪造与人脸操纵",
    "image_forgery": "图像篡改检测与定位",
    "scene_text_forgery": "场景文本图像伪造",
    "content_provenance": "内容凭证与水印验证",
    "image_steganalysis": "图像隐写与隐写分析",
    "digital_watermarking": "数字图像水印与认证",
}

CONTRIBUTION_TYPES = ("method", "dataset", "benchmark", "survey", "analysis")


def normalize_text(value: str) -> str:
    text = (value or "").lower().replace("&amp;", " and ")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[^a-z0-9+一-鿿]+", " ", text)
    # "Synthetic aperture radar/sonar" imagery is never synthetic-image forensics.
    text = re.sub(r"\bsynthetic aperture (?:radar|sonar|laser|imaging)\b", "sar", text)
    text = re.sub(r"\bartificial intelligence\b", "ai", text)
    # Halftoning, MRI and PDE "diffusion" are not diffusion models.
    text = re.sub(r"\b(?:error|dot|anisotropic|heat|nonlinear|thermal) diffusion\b|\bdiffusion (?:weighted|tensor|mri|filter\w*|equations?|process(?:es)?|coefficients?|kurtosis)\b", "pdediffusion", text)
    # Diffusion *language* models generate text, not images.
    text = re.sub(r"\bdiffusion (?:large )?language models?\b", "language model", text)
    return re.sub(r"\s+", " ", text).strip()


def _rx(*alternatives: str) -> re.Pattern[str]:
    return re.compile("|".join(f"(?:{item})" for item in alternatives))


def _near(left: str, right: str, gap: int = 4) -> str:
    """``left`` and ``right`` within ``gap`` words of each other, in either order."""
    words = rf"(?:\s+\S+){{0,{gap}}}?\s+"
    return rf"\b(?:{left})\b{words}\b(?:{right})\b|\b(?:{right})\b{words}\b(?:{left})\b"


# --- shared vocabulary --------------------------------------------------------

IMAGE = (
    r"images?|imagery|imaging|photos?|photographs?|photographic|pictures?|pixels?|visual|visuals|jpeg|jpg|png"
    r"|faces?|facial|portraits?|selfies?|artworks?|paintings?|ai art|digital art|scene text|text images?"
    r"|document images?|remote sensing|satellite|aerial|medical images?|x ray|mri|radiographs?|cameras?"
    r"|still|thumbnails?|memes?|screenshots?|cover|stego|grayscale|greyscale|rgb|cartoons?|illustrations?"
    r"|graphics|raw|multimedia|media|content|deepfakes?|stable diffusion|text to image|t2i|diffusion|gans?"
)
IMAGE_STRICT = (
    r"images?|imagery|photos?|photographs?|photographic|pictures?|pixels?|visual|jpeg|jpg|png|faces?|facial|portraits?"
    r"|selfies?|artworks?|paintings?|scene text|text images?|document images?|remote sensing|satellite|aerial"
    r"|medical images?|x ray|mri|radiographs?|cameras?|thumbnails?|memes?|screenshots?|grayscale|rgb|cartoons?"
    r"|illustrations?|graphics"
)
# Verbs/nouns that make a phrase about generated or manipulated content forensic.
# Context that makes a language-model or model-watermarking title visual.
VISUAL_CONTEXT = re.compile(
    rf"\b(?:{IMAGE_STRICT}|vision|multimodal|multi modal|multimedia|mllms?|lvlms?|vlms?|vision language|deep ?fakes?|diffusion|gans?"
    r"|content provenance|content credentials?|c2pa"
    r"|text to image|t2i|generative (?:image )?models?|media forensic\w*|stable diffusion)\b"
)
FORENSIC_CORE = (
    r"detect\w*|detector\w*|forensic\w*|identif\w*|recogni\w*|discriminat\w*|distinguish\w*|differentiat\w*|classif\w*"
    r"|spot\w*|expos\w*|uncover\w*|unmask\w*|reveal\w*|authentic\w*|verif\w*|locali[sz]\w*|benchmark\w*"
    r"|datasets?|database|survey|review|challenge|competition|fight\w*|combat\w*|counter\w*|defen\w*|mitigat\w*"
    r"|explain\w*|interpret\w*|evaluat\w*|analy[sz]\w*|assess\w*|real or fake|fake or real|real vs|vs real|tell\w*|catch\w*"
    r"|investigat\w*"
)
# Verbs that make even a loosely phrased title about generated content a detection task.
DETECTION_VERBS = (
    r"detect\w*|detector\w*|forensic\w*|identif\w*|recogni\w*|discriminat\w*|distinguish\w*|differentiat\w*|classif\w*"
    r"|spot\w*|expos\w*|uncover\w*|unmask\w*|reveal\w*|authentic\w*|locali[sz]\w*|catch\w*|tell\w*"
)
FORENSIC = (
    r"detect\w*|detector\w*|forensic\w*|identif\w*|recogni\w*|discriminat\w*|distinguish\w*|differentiat\w*"
    r"|classif\w*|spot\w*|expos\w*|uncover\w*|unmask\w*|reveal\w*|authentic\w*|verif\w*|attribut\w*|trac\w*"
    r"|locali[sz]\w*|segment\w*|benchmark\w*|datasets?|database|survey|review|challenge|competition|fight\w*"
    r"|combat\w*|counter\w*|defen[cs]\w*|mitigat\w*|robust\w*|generali[sz]\w*|explain\w*|interpret\w*"
    r"|evaluat\w*|analy[sz]\w*|assess\w*|real or fake|fake or real|real vs|vs real|truth|trust\w*"
)
GENERATED = (
    r"(?:ai|aigc|aigi|machine|computer|cnn|gan|gans|stylegan\d?|biggan|progan|diffusion|ldm|ddpm|vae|autoencoder|model|neural"
    r"|genai|text to image|t2i|algorithm|artificially|synthetically|digitally|midjourney|dall e|sdxl|flux|llm|mllm)"
    r"\s+(?:generated|synthesi[sz]ed|created|made|produced|rendered|edited)"
    r"|aigc|aigi|ai generated content|ai art|ai artworks?|ai images?|ai photos?"
    r"|(?:generative ai|genai|gen ai)\s+(?:images?|imagery|content|art\w*|photos?|visuals?|media)"
    r"|synthetic\s+(?:\S+\s+)?(?:images?|imagery|photos?|pictures?|faces?|media|content|visuals?|portraits?)"
    r"|(?:synthetic|generated|fake)\s+(?:and|or)\s+(?:\S+\s+)?(?:images?|photos?|media|faces?)"
    r"|fake\s+(?:\S+\s+)?(?:images?|imagery|photos?|pictures?|faces?|media|visuals?|art\w*|portraits?)"
    r"|generated\s+(?:\S+\s+)?(?:images?|imagery|photos?|pictures?|faces?|media|content|visuals?|art\w*|portraits?)"
    r"|(?:gan|gans|diffusion|generative model|generator)\s+(?:images?|imagery|faces?|artifacts?|traces?)"
    r"|(?:images?|photos?|pictures?|faces?|content)\s+(?:generated|synthesi[sz]ed|created)\s+by\s+(?:\S+\s+){0,2}(?:ai|gans?|diffusion|generative|models?|text to image|t2i|stable diffusion|midjourney|dall e)\b"
)

# --- 1. records and modalities that are never in scope --------------------------

JUNK = _rx(
    r"^(?:fig|figure|table|supplementary(?: material| figure| table)?|appendix|graphical abstract|scheme|chart)\s*[a-z]?\d",
    r"^(?:erratum|corrigendum|correction|retraction|retracted|editorial|preface|front matter|back matter|index to)\b",
    r"^(?:licensed under|creative commons)\b",
    r"^(?:proceedings of|session details|title page|table of contents|keynote\b|author response|reviewer report|decision letter)",
    r"^review of\s*(?:[:\"“]|for\b)|^\(\s*\w+\s*'?\d{2}\s*\)",
    r"_supp\d*\b|\bsupplementary (?:material|file|data)\b|\.pdf$",
)
OTHER_MODALITY = _rx(
    r"\b(?:audio|audios|speech|voice|voices|speaker|speakers|music|song|songs|acoustic|sound)\b",
    r"\b(?:machine|ai|llm|chatgpt|gpt|model|human|language model)\s+(?:generated|written|authored)\s+(?:text|texts|essays?|reviews?|code|news)\b",
    r"\b(?:deepfake|synthetic|generated|fake)\s+text\b(?!\s+(?:images?|regions?|in images?))",
    r"\btext\s+(?:watermark\w*|steganograph\w*|steganaly\w*|classification|generation|authorship|provenance|hiding)\b",
    r"\b(?:english|arabic|chinese|urdu|hindi|persian|bengali|plain|natural language|unicode)\s+texts?\b|\btexts?\s+authentication\b",
    r"\b(?:code|codes)\s+(?:watermark\w*|provenance|stylometry)\b|\bcode provenance\b|\b(?:iot|smart grid|power grid|sensor data|telemetry)\b(?=.*\b(?:watermark|provenance|steganograph)\w*)",
    r"\b(?:linguistic|lexical|textual|generative text|coverless text|network|protocol|tcp|ip|voip|packet)\s+steganograph\w*",
    r"\b(?:llms?|large language models?|language models?|chatbots?|nlp)\b",
    r"(?=.*\b(?:watermark|steganograph|steganaly|fingerprint|tamper|provenance)\w*).*\b(?:3d (?:meshes|mesh|models?|point clouds?)|meshes|point clouds?|vector maps?|vector data|relational(?: databases?)?|outsourced databases?|database (?:watermark\w*|tamper\w*|quer\w*|records?|tuples?)|tabular|time series|graphs?|software|source code|programs?|blockchain transactions?|dna sequences?|genomic"
    r"|hardware|integrated circuits?|ics?|fpgas?|radio frequency|rf|rfid|garments?|textiles?|cloud (?:computing|data|storage)|5g|power systems?|sensor networks?|network traffic|protocols?)\b",
    r"\b(?:dnn|deep neural networks?|neural networks?|federated|model|models|classifiers?|datasets?)\s+(?:watermark\w*|fingerprint\w*|ownership|ip protection)\b",
    r"\bwatermark\w*\s+(?:deep neural networks?|neural networks?|dnns?|classifiers?|llms?|language models?)\b",
)
# Generated text, code or music is never an image topic, whatever else the title says.
GENERATED_NON_IMAGE = re.compile(
    r"\b(?:ai|machine|llms?|model|neural|chatgpt|gpt\w*|language model)\s+(?:generated|written)\s+(?:\S+\s+){0,2}(?:poems?|poetry|lyrics|stories|essays?|news|codes?|music|songs?|reviews?|comments?|tweets?|texts?|answers?|abstracts?|papers?)\b(?!\s+images?)"
)
AUDIO = re.compile(r"\b(?:audio|audios|speech|voice|voices|speaker|speakers|music|song|songs|acoustic|sound)\b")
VIDEO = re.compile(r"\b(?:videos?|video based|talking heads?|lip sync\w*)\b")
JOINT_IMAGE_VIDEO = re.compile(r"\b(?:images?|photos?|pictures?)\b.{0,24}\bvideos?\b|\bvideos?\b.{0,24}\b(?:images?|photos?|pictures?)\b")

# --- 2. off-topic subjects, unless the title also states a forensic task --------

OFF_TOPIC = {
    "ocr": _rx(
        r"\b(?:text|character|word|caption|license plate|number plate|logo)s?\s+(?:detection|localization|localisation|recognition|spotting|extraction|segmentation|reading|removal)\b",
        r"\bocr\b|\btext ?spotter\b|\bhandwrit\w*\s+(?:recognition|text|word)|document layout|binari[sz]ation\b",
    ),
    "biometrics": _rx(
        r"\bfingerprint\s+(?:images?|recognition|identification|verification|matching|enhancement|segmentation|classification|compression|liveness|spoof\w*|presentation|minutiae|singular|ridge\w*|orientation|indexing|databases?|quality|sensors?|capture|model\w*|topolog\w*|individuality|templates?|based gender)\b",
        r"\b(?:minutiae?|ridge (?:count|orientation|frequency)|palm ?prints?|iris (?:recognition|images?|codes?)|finger veins?|gait|signature (?:verification|forgery)|ear recognition|keystroke)\b",
        r"\bface\s+(?:recognition|verification|identification|anti spoofing|liveness)\b|\bpresentation attack\b",
    ),
    "device_identification": _rx(
        r"\b(?:source\s+)?(?:camera|device|smartphone|mobile phone|sensor|printer|scanner|lens)\s+(?:model\s+)?(?:identification|attribution|recognition|classification|fingerprint\w*|linking|forensics)\b",
        r"\bsource (?:camera|device|printer|scanner|social network)s?\b",
    ),
    "computer_forensics": _rx(
        r"\b(?:malware|ransomware|phishing|spam|intrusion|botnets?|disk images?|memory (?:forensic\w*|images?|dumps?)|network forensic\w*|file carving|log files?|emails?|smart contracts?|cryptojacking)\b",
    ),
    "physical_forensics": _rx(
        r"\b(?:uranium|ballistic\w*|firearms?|cartridges?|bullets?|tool ?marks?|dna|bloodstains?|soil|glass fragments?|fibres?|fibers?|gunshot|explosives?|fire debris|toxicolog\w*|odontolog\w*|anthropolog\w*|skeletal|postmortem|autopsy|fingermarks?|footwear|shoe ?prints?|coffee|food authenticity|geographical origin|banknotes?|currency|counterfeit (?:drugs?|medicines?|coins?))\b",
    ),
    "misinformation": _rx(r"\b(?:fake news|misinformation|disinformation|rumou?rs?|fact check\w*|propaganda|hoax\w*|out of context)\b"),
    "encryption": _rx(r"\b(?:image )?encryption\b|\bcryptosystems?\b|\bchaotic (?:maps?|systems?)\b|\bsecret (?:image )?sharing\b|\bvisual cryptography\b"),
    "humanities": _rx(
        r"\b(?:effort|blame|causal|credit|responsibility|fundamental|social|authorship) attributions?\b|\battributions? (?:errors?|bias|theory)\b",
        r"\b(?:copyright (?:attribution|ownership|law|infringement liability)|intellectual property law|legal|laws|ownership and|liability|jurisprudence|regulations?|regulatory|governance|labell?ing mandate)\b",
        r"\b(?:consumers?|aesthetic\w*|psycholog\w*|public opinion|political discourse|newsrooms?)\b",
    ),
    "xai": _rx(
        r"\b(?:feature|pixel|saliency|gradient|causal|visual|attention|token|input)\s+attributions?\b|\battributions?\s+(?:maps?|methods?|scores?|driven|based explanations?)\b",
        r"\bexplain\w*\b.{0,50}\battributions?\b|\battributions?\b.{0,50}\bexplain\w*",
    ),
}
# Synthetic/generated images used only as training data for another task.
DOWNSTREAM_SYNTHETIC = _rx(
    r"\b(?:generating|generation of|synthesi[sz]ing|creating|creation of)\s+(?:\S+\s+){0,2}(?:synthetic|training|artificial)\s+(?:\S+\s+){0,2}(?:images?|data|datasets?|samples?)",
    r"\bsynthetic\s+(?:training\s+)?(?:data|datasets?|samples?)\b|\b(?:data augmentation|training data|augmented data)\b",
    r"\b(?:synthetic|generated|augmented)\s+(?:\S+\s+){0,2}(?:for|to)\s+(?:\S+\s+){0,2}(?:training|augmentation|improv\w*|enhanc\w*)\b",
    r"\b(?:object|defects?|vehicles?|tumou?rs?|cancer|disease|lesions?|ships?|cracks?|faults?|anomal\w*|pedestrians?|uavs?|drones?|weeds?|pests?|fruits?|plants?|cells?)\s+(?:detection|recognition|segmentation|classification|localization|counting)\b",
)
FORENSIC_RESCUE = re.compile(
    r"\b(?:fakes?|forg\w*|tamper\w*|manipulat\w*|deep ?fakes?|forensic\w*|authentic\w*|provenance|watermark\w*|stegan\w*|attribution|spoof\w*)\b"
    r"|\breal (?:or|vs|versus|and) (?:fake|synthetic|generated|ai)\b"
    r"|\b(?:ai generated|synthetic|generated|aigc|aigi) (?:images? )?(?:detection|detectors?|forensics|identification)\b"
)
TECHNICAL_RESCUE = re.compile(
    r"\b(?:detect\w*|detector\w*|forensic\w*|locali[sz]\w*|defen[cs]\w*|proactive|watermark\w*|c2pa|benchmark\w*|datasets?"
    r"|provenance (?:tracking|tracing|verification|state\w*)|algorithms?|networks?|framework)\b"
)
MISINFORMATION_RESCUE = _rx(
    r"\b(?:image|photo|picture)s?\s+(?:forger\w*|tamper\w*|manipulat\w*|splic\w*|doctor\w*)\b",
    r"\b(?:tampered|forged|manipulated|doctored|spliced|fake|generated|synthetic|ai generated)\s+(?:images?|photos?|pictures?)\b",
    r"\bdeep ?fakes?\b|\bcheapfakes?\b|\bvisual forensic\w*",
)

# --- 3. research-direction rules (title) ------------------------------------------

SYNTHETIC_TITLE = _rx(
    _near(GENERATED, FORENSIC_CORE, 4),
    _near(GENERATED, DETECTION_VERBS, 6),
    r"\b(?:real|natural|authentic|camera captured|photographic)\s+(?:images?\s+)?(?:and|or|vs|versus|from)\s+(?:ai|fake|synthetic|generated|computer generated|cg|gan|diffusion)\b",
    r"\b(?:computer graphics|cg)\s+(?:images?\s+)?(?:and|vs|versus|from)\s+(?:natural|photographic|real)",
    r"\b(?:aigc|aigi|ai generated image|synthetic image|fake image|generated image)\s+(?:detection|detectors?|forensics|identification|recognition)\b",
)
DEEPFAKE_CUE = (
    r"deep ?fakes?|deepfak\w*|face ?swap\w*|faceswap|face forger\w*|facial forger\w*|face manipulat\w*|facial manipulat\w*"
    r"|manipulated faces?|forged faces?|fake faces?|synthetic faces?|generated faces?|gan faces?|face morph\w*|morphing attacks?"
    r"|morph attacks?|morphed faces?|face reenact\w*|facial reenact\w*|expression swap|face tamper\w*|face forensic\w*|partial face"
    r"|cheapfakes?|shallowfakes?|face edit\w*|facial attribute manipulation|(?:face|facial) images? (?:manipulat\w*|forger\w*|tamper\w*)"
)
DEEPFAKE_FORENSIC = rf"{FORENSIC_CORE}|investigat\w*|prevent\w*|protect\w*|disrupt\w*|immuni[sz]\w*|proactive|anti deepfake"
DEEPFAKE_TITLE = _rx(
    _near(DEEPFAKE_CUE, DEEPFAKE_FORENSIC, 8),
    r"\bagainst\s+(?:\S+\s+){0,2}(?:deep ?fakes?|deepfak\w*|face ?swap\w*|face forger\w*|facial manipulat\w*|face manipulat\w*)", r"\b(?:morph\w* attack detection|face forensics|face forgery|deepfake detection|deepfake forensics)\b")
ATTRIBUTION_TITLE = _rx(
    _near(r"(?:model|source|generator|origin|architecture|gan|diffusion|provenance)\s+(?:attribution|identification|tracing|traceability|linking|parsing|inference)", r"gans?|diffusion|generat\w*|synthe\w*|ai|aigc|deep ?fakes?|fake|text to image|t2i", 6),
    _near(
        r"attribution\w*|attributing",
        r"ai|gans?|diffusion|deep ?fakes?|aigc|text to image|t2i|generative models?|(?:fake|synthetic|generated|ai generated)\s+(?:\S+\s+)?(?:images?|media|content|faces?)",
        4,
    ),
    r"\b(?:gan|gans|diffusion|generative model|generator|text to image model)s?\s+fingerprint\w*",
    r"\b(?:generator|gan|diffusion|generative model)s?\s+(?:attribution|identification|tracing|traceability)\b",
    _near(r"traceab\w*|tracing|trace|traces|tracking", GENERATED, 4),
    _near(r"fingerprint\w*", r"generative|gans?|diffusion|text to image|t2i|generators?", 4),
    r"\bfingerprint\w*\s+(?:of|for|in|from)\s+(?:the\s+)?(?:gan|gans|diffusion|generative|generated|generator|deep generative|ai|text to image)",
    r"\breverse engineer\w*\s+(?:of\s+)?(?:the\s+)?(?:generative|gan|gans|diffusion|deep ?fakes?|image generat\w*|generated)",
    r"\bmodel parsing\b|\bwhich (?:generator|model|gan)\b|\bgenerator identification\b|\b(?:gan|diffusion) (?:model )?identification\b",
)
IMAGE_FORGERY_SPECIFIC = _rx(
    r"\bcopy ?move\b|\bcopy paste forger\w*|\bregion duplication\b|\bcloning (?:detection|forger\w*)",
    r"\b(?:image|photo|picture)s?\s+splic\w*|\bsplic\w*\s+(?:detection|forger\w*|locali[sz]\w*|forensic\w*|images?|attacks?|regions?)|\bspliced\b|\bphotomontage\b",
    r"\b(?:image|photo|picture|digital image|jpeg)s?\s+(?:content\s+)?(?:forger\w*|tamper\w*|falsif\w*|doctor\w*)",
    _near(r"(?:image|photo|picture)s?\s+(?:manipulat\w*|alteration\w*|edit\w*)", FORENSIC_CORE, 6),
    r"\b(?:forged|tampered|doctored)\s+(?:images?|photos?|pictures?|regions?|areas?|objects?)",
    r"\bforg(?:ery|eries|ed)\s+(?:images?|photos?|pictures?)\s+(?:detection|identification|locali[sz]\w*|forensic\w*|recognition)",
    r"\bforensic detection of (?:\S+\s+){0,3}(?:images?|jpeg|photos?)\b|\bforensic detection for image\b",
    _near(r"(?:manipulated|altered|edited)\s+(?:images?|photos?|pictures?|regions?)", FORENSIC_CORE, 3),
    r"\b(?:image|digital image)s?\s+(?:\S+\s+)?forensic\w*|\b(?:photo|picture|visual|multimedia|passive|blind|digital photo|jpeg)s?\s+forensic\w*",
    r"\bforensic detection\b(?=.*\b(?:images?|jpeg|photos?)\b)|\b(?:coder|codec|compression|encoder)\s+forensic\w*",
    _near(r"median filter\w*|bilateral filter\w*|gaussian blur\w*|sharpen\w*|gamma correction|histogram equali[sz]\w*", r"detect\w*|forensic\w*", 3),
    r"\bdouble (?:jpeg|jpg|compression|compressed|quantization)\b|\b(?:jpeg|jpg)\s+(?:re)?compression\s+(?:detection|forensic\w*|history|identification)",
    r"\b(?:non )?aligned double\b|\bprimary quantization\b",
    r"\bresampl\w*\s+(?:detection|forensic\w*|estimation|traces?|forger\w*)|\bmedian filter\w*\s+(?:detection|forensic\w*)",
    _near(r"contrast enhancement", FORENSIC_CORE, 3),
    _near(r"seam carv\w*", FORENSIC_CORE, 4),
    _near(r"inpaint\w*", r"detect\w*|forensic\w*|locali[sz]\w*|forger\w*|tamper\w*|segment\w*", 3),
    _near(r"object removal|retouch\w*", FORENSIC_CORE, 3),
    r"\b(?:image )?(?:operation|operator|operators|processing)\s+(?:chains?|history|histories|order)\b|\banti ?forensic\w*|\bcounter ?forensic\w*",
    r"\b(?:image )?edit\w*\s+(?:detection|locali[sz]\w*)\b|\berror level analysis\b|\bnoiseprint\b|\bcfa (?:artifacts?|interpolation|traces?)\b",
)
IMAGE_FORGERY_GENERIC = _rx(
    r"\b(?:forger\w*|tamper\w*|manipulation)\s+(?:detection|locali[sz]\w*|segmentation|identification|analysis|forensics)\b",
    r"\b(?:detect\w*|locali[sz]\w*|expos\w*|reveal\w*|identif\w*)\s+(?:\S+\s+){0,2}(?:forger\w*|tamper\w*|manipulation)",
    r"\b(?:image|photo|picture)s?\s+authenticity\b",
)
SCENE_TEXT_OBJECT = (
    r"scene texts?|text images?|text regions?|textual images?|documents?|document images?|doc images?|receipts?|invoices?"
    r"|certificates?|diplomas?|id cards?|identity cards?|identity documents?|id documents?|passports?|driving licen[cs]es?"
    r"|visa stickers?|cheques?|bank checks?|printed (?:texts?|documents?)|texts? in images?|tampered texts?|forged texts?"
    r"|forged characters?|text tamper\w*|text forger\w*"
)
SCENE_TEXT_FORGERY = _rx(_near(SCENE_TEXT_OBJECT, r"forg\w*|tamper\w*|falsif\w*|counterfeit\w*|fraud\w*|altered|alteration\w*|fabricat\w*", 4))
SCENE_TEXT_DIRECT = re.compile(r"\b(?:tampered|forged|manipulated|altered|edited|doctored)\s+(?:scene\s+)?(?:texts?|characters?|documents?|receipts?|invoices?|certificates?)\b")
SCENE_TEXT_EDITED = _rx(_near(SCENE_TEXT_OBJECT, r"manipulat\w*|fake\w*|edit\w*|replac\w*|insert\w*|delet\w*|eras\w*", 3))
FORENSIC_CORE_RX = re.compile(rf"\b(?:{FORENSIC_CORE})\b")
PROVENANCE_TITLE = _rx(
    r"\bc2pa\b|\bcontent credentials?\b|\bcontent authenticity\b|\bcontent provenance\b|\bmedia provenance\b|\bimage provenance\b",
    r"\bvisual provenance\b|\bimage phylogen\w*|\bphylogeny\b|\bprovenance (?:analysis|graphs?|filtering|verification|tracking|tracing|chains?|protection)\b",
    _near(
        r"watermark\w*",
        r"generated|generative (?:ai|content|models?)|diffusion models?|latent diffusion|stable diffusion|aigc|ai generated|text to image|t2i"
        r"|synthetic (?:images?|media|content)|deep ?fakes?|provenance|traceab\w*|proactive|generators?",
        6,
    ),
    r"\bgenerative (?:image )?watermark\w*|\bdiffusion watermark\w*|\bwatermark\w* (?:for|of|in) (?:\S+\s+){0,2}(?:generated|generative|diffusion|aigc)\b",
    _near(r"watermark\w*", r"diffusion (?:art|editing|mimicry|appropriation|models?)|ai art|style mimicry", 6),
    _near(r"blockchain", r"images?|media|photos?|visual|content", 6),
    r"\b(?:secure|trusted|trustworthy|verifiable|authenticated)\s+(?:cameras?|capture|imaging)\b",
    r"\bproactive (?:defen[cs]e|detection|forensic\w*|protection)\b",
    _near(r"provenance", r"synthetic media|ai generated|aigc|generated (?:images?|content|media)|deep ?fakes?|photos?|images?|media|visual content", 6),
)
STEGO_TITLE = _rx(
    r"\bsteganaly\w*|\bsteganograph\w*|\bstegan\w*|\bstego\w*",
    r"\bcover (?:and |vs |& )?stego\b|\bcover (?:selection|source mismatch)\b|\bembedding (?:costs?|distortion)\b|\b(?:s|j) uniward\b|\bbatch steganograph\w*|\bpooled steganaly\w*",
    r"\b(?:lsb|least significant bits?)\b.{0,40}\b(?:embedding|hiding|hidden|secret|messages?|matching|replacement|detection)\b",
    r"\b(?:hiding|hide|hidden)\s+(?:\S+\s+){0,3}(?:images?|messages?|secrets?|data|information)\s+(?:in|within|into|inside)\s+(?:\S+\s+){0,2}images?",
    r"\b(?:image|invisible)\s+(?:data|information)\s+hiding\b",
)
WATERMARK_TITLE = _rx(
    r"\bwatermark\w*|\bzero watermark\w*|\bwater marking\b",
    r"\bself (?:embedding|recovery|recover\w*)\b.{0,60}\b(?:tamper\w*|images?|authenticat\w*)",
    r"\bcopyright (?:protection|marking|authentication|verification)\b",
    r"\b(?:image|photo)s?\s+authentication\b.{0,60}\b(?:hash\w*|signatures?|crypto\w*|fragile|self embedding|embedding|recovery)",
    r"\b(?:hash\w*|signatures?|fragile|self embedding)\b.{0,60}\b(?:image|photo)s?\s+authentication\b",
    r"\b(?:perceptual|robust|image)\s+hash\w*\b.{0,60}\b(?:authenticat\w*|tamper\w*|forensic\w*|integrity)",
    r"\b(?:fragile|semi fragile)\s+(?:schemes?|techniques?|methods?|marking|authentication)\b",
    _near(r"reversible (?:\S+\s+){0,2}data hiding|rdh|data hiding|information hiding", r"authenticat\w*|tamper\w*|integrity|forensic\w*", 10),
)

# --- abstract evidence: explicit task statements only ------------------------

ABSTRACT_RULES = {
    "synthetic_detection": _rx(
        rf"(?:detect\w*|identif\w*|distinguish\w*|discriminat\w*|classif\w*|spot\w*|expos\w*|differentiat\w*)\s+(?:\S+\s+){{0,4}}(?:{GENERATED})",
        r"\b(?:ai generated|synthetic|fake|generated|aigc|aigi)\s+image\s+(?:detection|detectors?|forensics)\b",
    ),
    "source_attribution": _rx(
        r"\b(?:model|source|generator|origin)\s+attribution\s+(?:of|for)\s+(?:ai\s+)?(?:generated|synthetic|fake|gan|diffusion)",
        r"\battribut\w*\s+(?:\S+\s+){0,3}(?:generated|synthetic|fake) images?\s+to\s+(?:their|the)\s+(?:source|generat\w*|models?)",
    ),
    "deepfake_detection": _rx(r"\b(?:deep ?fakes?|face forgery|face manipulation|facial manipulation|face swap\w*|morphing attacks?)\s+(?:detection|detectors?|forensics|localization)\b"),
    "image_forgery": _rx(
        r"\bimage (?:forgery|tampering|manipulation|splicing) (?:detection|localization|localisation)\b",
        r"\bcopy move forgery\b|\bsplicing (?:detection|localization)\b|\b(?:forged|tampered|manipulated) (?:image )?regions?\b",
    ),
    "scene_text_forgery": _rx(
        r"\b(?:tampered|forged|manipulated|fake) (?:scene )?text\b|\btext (?:image )?(?:tampering|forgery|manipulation) (?:detection|localization)\b",
        r"\bdocument (?:image )?(?:forgery|tampering) (?:detection|localization)\b",
    ),
    "content_provenance": _rx(r"\bc2pa\b|\bcontent credentials?\b|\bprovenance (?:verification|tracking|of (?:ai\s+)?generated)\b"),
    "image_steganalysis": _rx(r"\bsteganaly\w*|\b(?:image|jpeg|spatial) steganograph\w*|\bstego images?\b"),
    "digital_watermarking": _rx(r"\b(?:digital|image|robust|fragile|semi fragile|invisible|zero) watermark\w*"),
}
WEAK_TITLE_CLUE = _rx(
    r"\b(?:detect\w*|forensic\w*|fakes?|forg\w*|tamper\w*|manipulat\w*|locali[sz]\w*|authentic\w*|attribut\w*|verif\w*|provenance"
    r"|watermark\w*|steganaly\w*|steganograph\w*|traceab\w*|resampling|double jpeg|seam carving|inpainting|retouching|generated|synthetic)\b"
)

# Order is the display order of TASK_LABELS.
TITLE_RULES = {
    "synthetic_detection": SYNTHETIC_TITLE,
    "source_attribution": ATTRIBUTION_TITLE,
    "deepfake_detection": DEEPFAKE_TITLE,
    "content_provenance": PROVENANCE_TITLE,
    "image_steganalysis": STEGO_TITLE,
    "digital_watermarking": WATERMARK_TITLE,
}


@dataclass
class Classification:
    in_scope: bool
    tasks: list[str] = field(default_factory=list)
    reason: str = ""


def _title_tasks(title: str) -> dict[str, str]:
    """Directions stated in the title, with the kind of evidence that matched."""
    found: dict[str, str] = {}
    for task, rule in TITLE_RULES.items():
        if rule.search(title):
            found[task] = "title"
    if SCENE_TEXT_DIRECT.search(title) or SCENE_TEXT_FORGERY.search(title) or (SCENE_TEXT_EDITED.search(title) and FORENSIC_CORE_RX.search(title)):
        found["scene_text_forgery"] = "title"
    specific = IMAGE_FORGERY_SPECIFIC.search(title)
    generic = IMAGE_FORGERY_GENERIC.search(title)
    other_tamper_task = {"deepfake_detection", "scene_text_forgery", "digital_watermarking", "synthetic_detection"} & found.keys()
    if specific or (generic and not other_tamper_task):
        found["image_forgery"] = "title"
    # Watermark/steganography titles use "tamper detection" for the scheme's own
    # verification step; that is not passive tamper forensics.
    if "image_forgery" in found and not specific and {"digital_watermarking", "image_steganalysis"} & found.keys():
        found.pop("image_forgery")
    # Fake *images* in a face context are deepfakes rather than generic synthesis.
    if "synthetic_detection" in found and "deepfake_detection" in found and not re.search(
        r"\b(?:ai|aigc|aigi|diffusion|gan|gans|text to image|t2i|generative|synthetic images?|generated images?)\b", title
    ):
        found.pop("synthetic_detection")
    return found


def _excluded(title: str, title_tasks: dict[str, str], raw_title: str = "") -> str:
    if JUNK.search(title) or (raw_title and JUNK.search(raw_title)):
        return "not a paper record"
    if GENERATED_NON_IMAGE.search(title):
        return "other modality"
    # Spectrogram "images" are audio represented visually.
    if AUDIO.search(title) and (re.search(r"\bspectrograms?\b", title) or not re.search(rf"\b(?:{IMAGE_STRICT})\b", title)):
        return "other modality"
    if OTHER_MODALITY.search(title) and not (VISUAL_CONTEXT.search(title) and title_tasks):
        return "other modality"
    if VIDEO.search(title) and not JOINT_IMAGE_VIDEO.search(title):
        return "video"
    if DOWNSTREAM_SYNTHETIC.search(title) and not FORENSIC_RESCUE.search(title):
        return "synthetic training data"
    for topic, rule in OFF_TOPIC.items():
        if not rule.search(title):
            continue
        if topic == "misinformation":
            if not MISINFORMATION_RESCUE.search(title):
                return topic
        elif topic == "xai":
            continue
        elif topic == "humanities":
            if not (title_tasks and TECHNICAL_RESCUE.search(title)):
                return topic
        elif topic == "ocr":
            if not {"scene_text_forgery", "image_forgery", "image_steganalysis", "digital_watermarking"} & title_tasks.keys():
                return topic
        elif not title_tasks:
            return topic
    return ""


def classify(title: str, abstract: str = "") -> Classification:
    title_text = normalize_text(title)
    if not title_text:
        return Classification(False, reason="empty title")
    tasks = _title_tasks(title_text)
    # Explanation "attributions" and biometric fingerprints are not generator attribution.
    if OFF_TOPIC["xai"].search(title_text) or OFF_TOPIC["biometrics"].search(title_text):
        tasks.pop("source_attribution", None)
    reason = _excluded(title_text, tasks, " ".join((title or "").lower().split()))
    if reason:
        return Classification(False, reason=reason)

    abstract_text = normalize_text(abstract)
    abstract_tasks = [task for task, rule in ABSTRACT_RULES.items() if abstract_text and rule.search(abstract_text)]
    if tasks:
        ordered = [task for task in TASK_LABELS if task in tasks]
        # A title that only says "image forensics" leaves the concrete task to the abstract.
        if ordered == ["image_forgery"] and re.search(r"\bforensic\w*\b", title_text) and not IMAGE_FORGERY_GENERIC.search(title_text):
            extra = [task for task in abstract_tasks if task != "image_forgery"]
            if extra:
                ordered = [task for task in TASK_LABELS if task in {*ordered, *extra}]
        return Classification(True, ordered, "title")
    if abstract_tasks and WEAK_TITLE_CLUE.search(title_text):
        return Classification(True, [task for task in TASK_LABELS if task in abstract_tasks], "abstract")
    return Classification(False, reason="no stated image-forensics task")


def is_in_scope(title: str, abstract: str = "") -> bool:
    return classify(title, abstract).in_scope


def classify_tasks(title: str, abstract: str = "") -> list[str]:
    return classify(title, abstract).tasks


# --- contribution type -------------------------------------------------------------

SURVEY = _rx(
    r"\b(?:survey|surveys|review|reviews|overview|taxonomy|tutorial|primer|roadmap|meta survey|state of the field|sok)\b",
    r"\b(?:literature (?:review|survey)|systematic literature|systematization of knowledge)\b",
    r"\bpast,? present,? and future\b|\bpresent and future (?:challenges|directions|trends|perspectives)\b",
    r"\b(?:trends|challenges|perspectives|opportunities|open problems|future directions|state of the art|research gaps)\b",
    r"\bresearch (?:trends|directions|landscape|progress|advances)\b|\b(?:recent )?advances in\b|\ba decade of\b",
)
SURVEY_ABSTRACT = _rx(
    r"\b(?:this|our|the present)\s+(?:paper|article|work|chapter|study)\s+(?:\S+\s+){0,2}(?:presents|provides|offers|gives|conducts)\s+(?:a|an)\s+(?:\S+\s+){0,3}(?:survey|review|overview)\b",
    r"\bin this (?:survey|review)\b",
)
DATASET = _rx(
    r"^[^:]{1,80}:\s*(?:an?|the)?\s*(?:\S+\s+){0,7}?(?:datasets?|database|corpus|benchmark datasets?)\b",
    r"\b(?:an?|the|new|novel|large|large scale|million scale|comprehensive|first|diverse|realistic|real world|challenging|high quality|high fidelity|open|public|annotated|controlled|unified|extended|multi dimensional|in the wild)\s+(?:\S+\s+){0,5}?(?:datasets?|database|corpus)\s*(?:$|for|of|and|to|with|towards?|in)\b",
    r"\b(?:datasets?|database|corpus)\s+(?:and|&)\s+(?:a\s+)?(?:benchmarks?|baselines?|methods?|solutions?|models?|algorithms?|detectors?)\b",
    r"\b(?:datasets?|database|corpus)\s*$",
    r"^(?:\S+\s+){0,6}(?:datasets?|database|corpus)\s*:",
)
NOT_DATASET = _rx(
    r"\bcross (?:datasets?|database)\b|\b(?:datasets?|database) (?:mismatch|bias|shift|diversity|generali[sz]\w*|distillation|usage)\b",
    r"\b(?:using|on|with|from|across|over|via|under)\s+(?:the\s+|a\s+|an\s+)?(?:\S+\s+){0,3}(?:datasets?|database|corpus)\b",
    r"\b(?:publicly available|diverse|multiple|several|different|various|benchmark|standard|small)\s+(?:datasets|databases)\b",
)
BENCHMARK = _rx(
    r"\bbenchmark\w*\b|\bchallenge\b|\bcompetition\b|\bleaderboard\b|\barena\b|\bevaluation (?:framework|protocol|suite|platform)\b",
    r"\b[a-z0-9]+bench\b|\b(?:assessing|evaluating)\s+(?:\S+\s+){0,4}(?:methods|detectors|algorithms|tools)\b"
)
ANALYSIS = _rx(
    r"\b(?:empirical|comparative|systematic|experimental|large scale|critical|quantitative|qualitative|exploratory|user|human|perceptual|psychophysical|statistical|performance|security|robustness|vulnerability|sensitivity|ablation)\s+(?:study|studies|analysis|evaluation|investigation|assessment|comparison)\b",
    r"\b(?:an?|the)\s+(?:study|analysis|investigation|evaluation|assessment|comparison|examination)\s+(?:of|on|into|for)\b",
    r"^(?:on|towards understanding|understanding|rethinking|revisiting|investigating|evaluating|analy[sz]ing|assessing|measuring|quantifying|characteri[sz]ing|demystifying|examining|comparing|probing)\b",
    r"\b(?:rethinking|revisiting|lessons|pitfalls|limitations|limits|vulnerabilit\w*|reliability of|effectiveness of|evaluation of|comparison of|study of|analysis of|investigation of|assessment of|impact of|influence of|role of|effect of|effects of)\b",
)


def contribution_type(title: str, abstract: str = "") -> str:
    raw = (title or "").lower()
    text = normalize_text(title)
    if SURVEY.search(text) or (abstract and SURVEY_ABSTRACT.search(normalize_text(abstract))):
        return "survey"
    stated_dataset = DATASET.search(raw.replace("–", "-")) or DATASET.search(text)
    new_dataset = re.search(r"\b(?:new|novel|large scale|our)\s+(?:\S+\s+){0,3}(?:datasets?|database)\b", text)
    if stated_dataset and (not NOT_DATASET.search(text) or new_dataset):
        return "dataset"
    if BENCHMARK.search(text):
        return "benchmark"
    proposes_method = re.search(
        r"\b(?:novel|new|proposed|improved|efficient|robust|lightweight|enhanced)\s+(?:\S+\s+){0,2}(?:approach|method|framework|network|model|scheme|algorithm|technique|architecture)\b", text
    )
    whole_question = raw.rstrip().endswith("?") and ":" not in raw
    if (ANALYSIS.search(text) or whole_question) and not proposes_method:
        return "analysis"
    return "method"
