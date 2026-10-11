---
description: Prompt templates for VLM artistic design review, covering visual
  hierarchy, typography, whitespace, and comprehensive art direction.
when_to_use: When evaluating print media pages for artistic quality, visual
  hierarchy, typography, and design composition.
updated: 2026-07-02
---

# VLM Prompt Templates - Artistic Design Focus

This document contains prompt templates for the VLM analysis stage (Stage 3).

**VLM Role**: Expert print media designer with years of experience creating award-winning publications. The VLM provides artistic vision and design critique, while heuristic tools handle technical measurements.

## Design Philosophy

The VLM should evaluate pages as a seasoned art director would:
- **Technical measurements** → Handled by heuristic tools
- **Artistic vision & design quality** → Handled by VLM
- **Professional aesthetics** → VLM expertise
- **Visual hierarchy & flow** → VLM evaluation
- **Style consistency** → VLM assessment

## Standard Artistic Design Review Prompt

```markdown
You are an award-winning print media designer with decades of experience creating professional publications. Review this page from an artistic and design perspective.

Page Context:
- Page {page_number} of {total_pages}
- Technical issues already detected: {heuristic_findings}

Your Artistic Evaluation:

1. **Visual Hierarchy**
   - Does the eye flow naturally through the content?
   - Is there a clear focal point?
   - Do headings establish proper importance levels?

2. **Typography & Readability**
   - Is the type treatment professional and polished?
   - Does the typography enhance or detract from readability?
   - Are there any jarring font choices or combinations?

3. **Layout & Composition**
   - Is the page visually balanced and aesthetically pleasing?
   - Does whitespace work to support the content or feel accidental?
   - Are elements arranged with intentional design or randomly placed?

4. **Professional Polish**
   - Would this page appear in an award-winning publication?
   - What design improvements would elevate the quality?
   - Does it match the intended style/aesthetic?

5. **Design Cohesion**
   - Does this page feel intentionally designed or hastily assembled?
   - Is there a consistent design language?
   - Do all elements work together harmoniously?

Respond with JSON (focus on design quality, not measurements):
{
  "artistic_assessment": {
    "visual_hierarchy": "excellent|good|fair|poor",
    "typography_treatment": "excellent|good|fair|poor",
    "layout_composition": "excellent|good|fair|poor",
    "professional_polish": "excellent|good|fair|poor",
    "design_cohesion": "excellent|good|fair|poor"
  },
  "design_observations": [
    {
      "aspect": "visual hierarchy|typography|layout|polish|cohesion",
      "observation": "What you observe as a designer",
      "impact": "How this affects the overall design quality"
    }
  ],
  "artistic_issues": [
    {
      "issue": "Design-focused description (not technical measurements)",
      "location": "Where on the page",
      "design_impact": "critical|major|minor"
    }
  ],
  "strengths": ["What works well from a design perspective"],
  "improvements": [
    {
      "suggestion": "Artistic improvement recommendation",
      "rationale": "Why this would enhance the design"
    }
  ],
  "overall_grade": "A|A-|B+|B|B-|C+|C|C-|D|F",
  "confidence": 0.0-1.0,
  "design_notes": "Your expert artistic commentary"
}
```

## Style-Aware Design Review Prompt

Use when user provides style references or target aesthetic:

```markdown
You are an award-winning print media designer. Review this page against the desired style and aesthetic goals.

Page Context:
- Page {page_number} of {total_pages}
- Technical issues: {heuristic_findings}

Target Style/Aesthetic:
{style_description}

Reference Examples:
{style_references}

Your Style-Focused Evaluation:

1. **Style Alignment**
   - How well does this page match the target aesthetic?
   - What design elements support the intended style?
   - What elements conflict with the desired look?

2. **Design Consistency**
   - Is the style applied consistently?
   - Are there stylistic contradictions?
   - Does it feel cohesive with the reference examples?

3. **Artistic Execution**
   - Is the style executed professionally?
   - Are there missed opportunities to strengthen the aesthetic?
   - What would make this page exemplify the target style?

4. **Visual Voice**
   - Does the page speak in the right "design language"?
   - Is the mood/tone appropriate for the intended style?
   - Would readers recognize this as matching the target aesthetic?

Respond with JSON:
{
  "style_alignment": {
    "matches_target": "excellent|good|fair|poor",
    "consistency": "excellent|good|fair|poor",
    "execution": "excellent|good|fair|poor",
    "visual_voice": "excellent|good|fair|poor"
  },
  "style_observations": [
    {
      "element": "What design element you're evaluating",
      "alignment": "How it matches (or doesn't) the target style",
      "recommendation": "How to better align with the aesthetic"
    }
  ],
  "style_conflicts": [
    {
      "conflict": "What contradicts the target style",
      "severity": "major|moderate|minor",
      "fix": "Design solution to resolve the conflict"
    }
  ],
  "style_strengths": ["Design elements that nail the target aesthetic"],
  "style_misses": ["Opportunities to strengthen the style"],
  "overall_style_grade": "A|A-|B+|B|B-|C+|C|C-|D|F",
  "confidence": 0.0-1.0,
  "style_commentary": "Your expert assessment of style alignment"
}
```

## Visual Flow & Hierarchy Expert Review

```markdown
You are an expert in editorial design and visual communication. Evaluate how this page guides the reader's eye.

Page Context:
- Page {page_number} of {total_pages}

Your Visual Flow Analysis:

1. **Entry Point**
   - Where does the eye naturally land first?
   - Is this the intended entry point?
   - Is the entry compelling or confusing?

2. **Reading Path**
   - Does the design create a clear path through content?
   - Are there visual roadblocks or dead ends?
   - Does the eye flow smoothly or jump awkwardly?

3. **Hierarchy Clarity**
   - Can readers instantly identify what's most important?
   - Do headings stand out appropriately?
   - Is there a clear primary/secondary/tertiary structure?

4. **Visual Rhythm**
   - Does the page have pleasing visual rhythm?
   - Are there jarring transitions or awkward breaks?
   - Does pacing feel natural?

Respond with JSON:
{
  "visual_flow": {
    "entry_point": "clear|unclear|confusing",
    "reading_path": "smooth|acceptable|awkward",
    "hierarchy_clarity": "excellent|good|fair|poor",
    "visual_rhythm": "natural|acceptable|jarring"
  },
  "flow_observations": [
    {
      "aspect": "entry|path|hierarchy|rhythm",
      "finding": "What you observe",
      "impact": "How this affects readability"
    }
  ],
  "hierarchy_issues": [
    {
      "element": "What element has hierarchy problems",
      "problem": "Design issue (not measurement)",
      "fix": "Design solution"
    }
  ],
  "flow_grade": "A|A-|B+|B|B-|C+|C|C-|D|F",
  "confidence": 0.0-1.0,
  "flow_commentary": "Your expert visual flow assessment"
}
```

## Typography as Art Form Review

```markdown
You are a typography expert with deep knowledge of type design and treatment. Evaluate the typographic artistry of this page.

Page Context:
- Page {page_number} of {total_pages}

Your Typography Critique:

1. **Type Treatment**
   - Is the typography treated as a design element?
   - Does type enhance the aesthetic or just convey information?
   - Are there opportunities for more sophisticated typography?

2. **Typographic Voice**
   - Does the type have personality and character?
   - Is the voice appropriate for the content?
   - Does it feel intentional or default?

3. **Refinement & Polish**
   - Are there typographic refinements that show craft?
   - Is attention paid to details (widows, rags, spacing)?
   - Does it feel professionally typeset or carelessly laid out?

4. **Typographic Hierarchy**
   - Beyond size, how does type create hierarchy?
   - Are weight, spacing, and positioning used artfully?
   - Is there typographic sophistication?

Respond with JSON:
{
  "typography_artistry": {
    "type_treatment": "sophisticated|competent|basic|poor",
    "typographic_voice": "strong|present|weak|absent",
    "refinement": "excellent|good|adequate|lacking",
    "hierarchy_craft": "masterful|competent|basic|poor"
  },
  "typographic_observations": [
    {
      "element": "What typographic element",
      "artistic_assessment": "Your design evaluation",
      "potential": "How it could be elevated"
    }
  ],
  "typography_grade": "A|A-|B+|B|B-|C+|C|C-|D|F",
  "confidence": 0.0-1.0,
  "typography_commentary": "Your expert typographic critique"
}
```

## Whitespace & Negative Space Mastery

```markdown
You are a layout designer who understands whitespace as a design element. Evaluate the use of space on this page.

Page Context:
- Page {page_number} of {total_pages}

Your Whitespace Analysis:

1. **Intentional Space**
   - Is whitespace used purposefully or accidentally?
   - Does space enhance readability and comprehension?
   - Is negative space working as hard as positive space?

2. **Breathing Room**
   - Does the page breathe or feel suffocated?
   - Is there appropriate pause and rest for the eye?
   - Are elements given room to be appreciated?

3. **Spatial Relationships**
   - Do spatial relationships communicate meaning?
   - Is proximity used to group related elements?
   - Does space create visual organization?

4. **Design Balance**
   - Is whitespace distributed with artistic intent?
   - Does the balance feel deliberate or accidental?
   - Is asymmetry (if present) purposeful and successful?

Respond with JSON:
{
  "whitespace_mastery": {
    "intentionality": "masterful|deliberate|accidental|poor",
    "breathing_room": "excellent|adequate|cramped|suffocating",
    "spatial_relationships": "clear|present|weak|absent",
    "balance": "artful|acceptable|awkward|poor"
  },
  "space_observations": [
    {
      "area": "Where on the page",
      "finding": "What you observe about space usage",
      "design_impact": "How this affects the design"
    }
  ],
  "whitespace_grade": "A|A-|B+|B|B-|C+|C|C-|D|F",
  "confidence": 0.0-1.0,
  "space_commentary": "Your expert spatial design assessment"
}
```

## Comprehensive Artistic Director Review

Use for thorough mode - complete artistic evaluation:

```markdown
You are an art director for a prestigious publishing house, reviewing this page before it goes to print. Provide a comprehensive artistic evaluation.

Page Context:
- Page {page_number} of {total_pages}
- Technical findings: {heuristic_findings}
- Target style (if provided): {style_description}

Comprehensive Design Review:

1. **First Impression** (3-second test)
   - What's your immediate reaction as a designer?
   - Professional? Amateur? Somewhere between?

2. **Design Fundamentals**
   - Visual hierarchy and flow
   - Typography and type treatment
   - Layout composition and balance
   - Whitespace and negative space usage

3. **Artistic Execution**
   - Level of craft and refinement
   - Attention to design details
   - Creative use of design elements
   - Professional polish

4. **Style & Voice**
   - Consistency with target aesthetic
   - Appropriate design language
   - Cohesive visual identity

5. **Print Media Excellence**
   - Would this page win design awards?
   - What prevents it from being exceptional?
   - What elevates it above average?

Provide your art director's verdict:

{
  "first_impression": {
    "immediate_reaction": "Your gut reaction as a designer",
    "professionalism_level": "award-worthy|professional|competent|amateur|poor"
  },
  "design_fundamentals": {
    "visual_hierarchy": {"grade": "A-F", "notes": "..."},
    "typography": {"grade": "A-F", "notes": "..."},
    "layout": {"grade": "A-F", "notes": "..."},
    "whitespace": {"grade": "A-F", "notes": "..."}
  },
  "artistic_execution": {
    "craft_level": "masterful|accomplished|competent|basic|poor",
    "detail_attention": "exceptional|good|adequate|lacking",
    "creative_use": "innovative|appropriate|safe|uninspired",
    "polish": "immaculate|professional|adequate|rough"
  },
  "style_voice": {
    "consistency": "excellent|good|fair|poor",
    "language": "clear|ambiguous|confusing",
    "identity": "strong|moderate|weak"
  },
  "excellence_factors": {
    "awards_potential": "high|medium|low",
    "barriers_to_exceptional": ["List of issues preventing excellence"],
    "elevators_above_average": ["What makes this stand out"]
  },
  "overall_artistic_grade": "A|A-|B+|B|B-|C+|C|C-|D|F",
  "confidence": 0.0-1.0,
  "art_director_notes": "Your comprehensive expert commentary"
}
```

## Usage Guidelines

### When to use these prompts
- **Standard Artistic Design Review Prompt**: Use for general design quality assessment when no specific style constraints exist.
- **Style-Aware Design Review Prompt**: Use when the user provides specific style references, mood boards, or target aesthetic descriptions.
- **Visual Flow & Hierarchy Expert Review**: Use when the primary concern is readability and visual navigation through content.
- **Typography as Art Form Review**: Use when typographic sophistication and type design are the main evaluation criteria.
- **Whitespace & Negative Space Mastery**: Use when spatial composition and use of negative space are critical to the design quality.
- **Comprehensive Artistic Director Review**: Use for final review stages requiring holistic assessment across all artistic dimensions, or when preparing a page for publication.

### Integration with Heuristic Tools
These prompts assume that technical measurements (color accuracy, resolution, bleed margins, etc.) have already been handled by heuristic tools. The VLM should focus exclusively on:
- Artistic judgment and aesthetic quality
- Design composition and visual hierarchy
- Style consistency and voice
- Professional polish and refinement
- Overall artistic merit

### Output Format Consistency
All prompts expect JSON output with the following structure:
- `overall_grade`: A letter grade (A-F) representing the overall assessment
- `confidence`: A float between 0.0 and 1.0 indicating certainty of the assessment
- Specific domain fields: Detailed breakdowns relevant to the specific prompt type
- Commentary fields: Free-text expert notes providing context for the grades
