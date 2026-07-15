from atlas.taxonomy import classify_tasks, contribution_type, is_in_scope


def test_scene_text_forgery_is_a_first_class_task():
    title = "Scene Text Image Forgery Detection and Localization after Text Replacement"
    assert is_in_scope(title)
    assert "scene_text_forgery" in classify_tasks(title)


def test_non_image_media_and_downstream_synthetic_training_are_excluded():
    assert not is_in_scope("Audio Deepfake Detection with Spectrogram Features")
    assert not is_in_scope("Temporal Transformer for Deepfake Video Detection")
    assert not is_in_scope("Synthetic Data Augmentation for Medical Image Segmentation")
    assert not is_in_scope("Deep Learning for Pneumonia Detection in Chest X-Ray Images")
    assert not is_in_scope("Change Detection in Remote Sensing Images")
    assert not is_in_scope("Mel-Spectrogram Image-Based Audio Deepfake Detection")
    assert not is_in_scope("Synthetic CT Image Generation From CBCT: A Systematic Review")
    assert not is_in_scope("An Evolution of Image Source Camera Attribution Approaches")
    assert not is_in_scope("Deepfake Detection Through Key Video Frame Extraction")
    assert not is_in_scope("Watermarking for English Text Authentication and Tampering Detection")
    assert not is_in_scope("Generating Synthetic Training Images to Detect Split Defects")


def test_contribution_types_are_separate_from_tasks():
    assert contribution_type("A Survey of AI-Generated Image Detection") == "survey"
    assert contribution_type("ForgeryNet: A Benchmark for Image Forgery") == "benchmark"


def test_classical_and_scene_text_image_forgery_are_retained():
    assert is_in_scope("Copy-Move Forgery Detection Using Statistical Features")
    title = "Robust Text Image Tampering Localization via Forgery Traces"
    assert is_in_scope(title)
    assert "scene_text_forgery" in classify_tasks(title)


def test_plain_scene_text_detection_is_not_misclassified_as_forgery():
    assert not is_in_scope("Scene Text Detection Based on Skeleton-Cut Detector")


def test_opaque_title_can_be_rescued_by_explicit_abstract():
    assert is_in_scope(
        "No Detector to Rule Them All",
        "We study generalizable AI-generated image detection in the wild.",
    )
