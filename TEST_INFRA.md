# Test Infrastructure and Verification Design (TEST_INFRA.md)

This document outlines the design, methodology, and implementation of the End-to-End (E2E) verification infrastructure for the scientific document completion project.

---

## 1. Feature Checklist

The verification system checks the compliance of `thuyetminhmoi.docx` against the following requirements derived from the project specifications:

| Requirement ID | Description                                                                                                             | Verification Method                  | Status                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------- |
| **R1**         | **Paragraph & Text Synchronization**: Text in `.docx` matches `thuyetminhmoi.txt` line-by-line (excluding empty lines). | Layer 2: Text Matching               | Failing on uncorrected docx |
| **R1.1**       | **Cover Page Text Extraction**: Text from the cover page textbox is extracted and matched.                              | Layer 2: Textbox xpath query         | Passed                      |
| **R1.2**       | **Body Paragraphs Extraction**: Text from paragraphs 2 onwards matches body text.                                       | Layer 2: Paragraph index slice       | Failing on uncorrected docx |
| **R2**         | **Realign Existing Figures**: Map 20 existing images to their correct captions and sections.                            | Layer 3: Figure Index / Order        | Failing on uncorrected docx |
| **R3**         | **Missing Code Figures**: Generate and insert `Hình 21` and `Hình 22` with syntax highlighting.                         | Layer 3: Color, format, aspect ratio | Failing on uncorrected docx |
| **R4**         | **Missing Android UI Figures**: Insert stylized UI placeholders for `Hình 9` and `Hình 13`.                             | Layer 3: Portrait aspect ratio check | Failing on uncorrected docx |
| **AC1**        | **Formatting & Legibility**: Captions correspond to correct images without misalignment.                                | Layer 3: Preceding paragraph check   | Failing on uncorrected docx |
| **AC2**        | **Word Compatibility**: Document compiles as a valid ZIP/OpenXML file and opens in MS Word.                             | Layer 1: ZIP & relationships check   | Passed                      |

---

## 2. 4-Tier Test Case Design Methodology

We apply a 4-tier testing hierarchy to ensure comprehensive and multi-layered document verification:

```
+-------------------------------------------------------------+
| Tier 4: Real-World Scenarios (MS Word Compatibility, CLI)   |
+-------------------------------------------------------------+
                            |
+-------------------------------------------------------------+
| Tier 3: Feature Combinations (Image Property Violations)    |
+-------------------------------------------------------------+
                            |
+-------------------------------------------------------------+
| Tier 2: Boundary & Corner Cases (Captions Order, Duplicates)|
+-------------------------------------------------------------+
                            |
+-------------------------------------------------------------+
| Tier 1: Core Feature Coverage (Integrity, Text Matching)   |
+-------------------------------------------------------------+
```

### Tier 1: Core Feature Coverage (Core Functionality)

- **TC-1.1: ZIP Integrity Check**: Verifies that the `.docx` file is a valid ZIP archive using Python's `zipfile` module.
- **TC-1.2: OpenXML Structure Validation**: Inspects the main body `word/document.xml` and relationships `word/_rels/document.xml.rels` to ensure valid OpenXML XML parsing.
- **TC-1.3: Text Stream Extraction**: Verifies that both the cover page textbox (using xpath `//mc:Choice//w:txbxContent//w:p`) and body paragraphs (from index 2 onwards) can be extracted successfully.
- **TC-1.4: Line-by-Line Normalization & Match**: Compares the non-empty lines from `.docx` and `.txt` after stripping margins and normalizing multiple spaces to a single space.

### Tier 2: Boundary & Corner Cases

- **TC-2.1: Caption Sequence Order**: Checks if there are exactly 24 captions numbered from 1 to 24 in strict ascending order.
- **TC-2.2: Duplicate Caption Detection**: Identifies if any caption number appears more than once (e.g., duplicate `Hình 23` and `Hình 24` under the Code section).
- **TC-2.3: Caption Missing Check**: Verifies if any caption from 1 to 24 is completely absent.
- **TC-2.4: Image Paragraph Adjacency**: Ensures that each caption paragraph is immediately preceded (at `idx - 1`) by an empty paragraph containing a valid XML `<w:drawing>` element.

### Tier 3: Feature Combinations & Property Constraints

- **TC-3.1: Web UI Figure Constraints (Figures 1-6)**:
  - Format: PNG.
  - Dimension: Landscape (`width > height`).
- **TC-3.2: Android UI Figure Constraints (Figures 7-13)**:
  - Format: PNG.
  - Dimension: Portrait (`height > width`, mobile layout).
- **TC-3.3: Code Snippet Figure Constraints (Figures 14-22)**:
  - Format: PNG.
  - Dimension: Landscape (`width > height`).
  - Color: Non-grayscale (syntax-highlighted, verified via RGB channel variance).
- **TC-3.4: Survey Figure Constraints (Figures 23-24)**:
  - Format: JPEG/JPG.
  - Dimension: Portrait (`height > width`).
- **TC-3.5: Mandatory Figure Verification**: Confirms that Figures 9, 13, 21, and 22 are present and strictly comply with their respective category property constraints.

### Tier 4: Real-World Scenarios & Integration

- **TC-4.1: MS Word Compatibility**: Verifies that XML elements (like textbox Choices and drawing structures) are fully compliant and will not trigger "Corrupted Document" errors in MS Word.
- **TC-4.2: CLI Runner Integration**: Checks that `verify_doc.py` supports configurable `--docx` and `--txt` arguments, prints detailed diffs of mismatches, and outputs a non-zero exit code on failure, allowing integration into automated CI pipelines.

---

## 3. Verification Script Architecture (`verify_doc.py`)

The test runner is designed as an opaque-box validator implemented in `verify_doc.py`.

### Validation Layers

1. **Layer 1 (ZIP & OpenXML Integrity)**:
   - Validates the `.docx` archive.
   - Extracts relationship map from `word/_rels/document.xml.rels`.
   - Iterates through all `drawing` nodes in `word/document.xml`, extracts their `blip` relationship ID (`r:embed`), matches it to the relationship target, and confirms the physical image exists inside the ZIP.

2. **Layer 2 (Text Matching)**:
   - Queries `//mc:Choice//w:txbxContent//w:p` to extract cover page details, translating `<w:br/>` tags to `\n`.
   - Concatenates the textbox lines and main body `doc.paragraphs[2:]` text.
   - Normalizes and compares lines with `thuyetminhmoi.txt` using `difflib.unified_diff`.

3. **Layer 3 (Figures Verification)**:
   - Finds all paragraphs matching caption format `^Hình\s+(\d+)[:.]`.
   - Validates the caption sequence.
   - Resolves preceding drawing elements to image binaries in the ZIP.
   - Verifies properties (format, size, grayscale) using the Pillow library.

---

## 4. Test Execution Instructions

### Prerequisites

- Python 3.10+
- Libraries: `python-docx`, `pillow`, `lxml`

### Usage

```bash
python verify_doc.py --docx <path_to_docx> --txt <path_to_txt>
```

### Exit Codes

- `0`: All checks passed.
- `1`: One or more verification checks failed.

---

## 5. Diagnostic Output (Uncorrected Document)

Running the script on the current uncorrected document `E:\lachancuocgoi\tailieu\thuyetminhmoi.docx` produces the following failures, documenting all omissions, shifts, and invalid properties:

### 1. Text Mismatches (Layer 2)

The text contains a 29-line mismatch due to omitted captions (Figures 7, 8, 13, 15, 21, 22) and misplaced code/survey figures:

- Figures 7, 8, and 13 are missing under Android UI.
- Figure 14 is placed under Android UI instead of Code.
- Figures 23 and 24 are duplicated under the Code section.
- Figures 21 and 22 are missing under the Code section.

### 2. Captions Order & Counts (Layer 3)

- Expected order: `[1, 2, ..., 24]`.
- Actual order: `[1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 14, 16, 17, 18, 19, 20, 23, 24, 23, 24]`.
- Missing captions: Figures 7, 8, 13, 15, 21, 22.
- Duplicated captions: Figures 23, 24.

### 3. Image Property Failures (Layer 3)

Due to the cascade shift, several figures point to incorrect image dimensions:

- `Figure 2`: Expected landscape aspect ratio (width > height), got portrait `672x683`.
- `Figure 3`: Expected landscape aspect ratio (width > height), got portrait `543x664`.
- `Figure 5`: Expected landscape aspect ratio (width > height), got portrait `422x746`.
- `Figure 11`: Expected portrait aspect ratio (height > width), got landscape `427x355`.
- `Figure 14`: Expected landscape aspect ratio (width > height), got portrait `293x362`.
- `Figure 23` (duplicate under Code): Expected JPEG format, got PNG.
- `Figure 24` (duplicate under Code): Expected JPEG format, got PNG.

### 4. Mandatory Figures

- Figures 13, 21, and 22 are completely missing.
