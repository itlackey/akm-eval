#!/usr/bin/env python3
"""
Validate Paged.js HTML/CSS for common issues.

Usage:
    python validate_pagedjs.py <html_file>
    python validate_pagedjs.py <html_file> --css <css_file>
"""

import argparse
import re
import sys
from pathlib import Path
from html.parser import HTMLParser


CSS_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)


def declaration_values(css_content, property_name):
    """Return values for a CSS property after removing comments."""
    clean_css = CSS_COMMENT_RE.sub("", css_content)
    pattern = rf"(?<![-\w]){re.escape(property_name)}\s*:\s*([^;}}]+)"
    return re.findall(pattern, clean_css, flags=re.IGNORECASE)


def counter_names(values):
    """Extract named counters from counter-reset/increment declarations."""
    keywords = {"none", "initial", "inherit", "unset", "revert", "revert-layer"}
    names = set()
    for value in values:
        for token in re.findall(r"[A-Za-z_][A-Za-z0-9_-]*", value):
            if token not in keywords and token != "reversed":
                names.add(token)
    return names


class PagedJSValidator(HTMLParser):
    def __init__(self):
        super().__init__()
        self.issues = []
        self.warnings = []
        self.info = []
        self.in_style = False
        self.style_content = []
        self.string_sets = set()
        self.string_uses = set()
        self.counter_resets = set()
        self.counter_increments = set()
        self.page_names = set()
        self.current_tag = None

    def handle_starttag(self, tag, attrs):
        self.current_tag = tag
        attrs_dict = dict(attrs)

        # Check for Paged.js script
        if tag == 'script':
            if 'paged' in attrs_dict.get('src', '').lower():
                self.info.append("✓ Paged.js script found")

        # Check for style tag
        if tag == 'style':
            self.in_style = True

        # Check for problematic absolute positioning
        if 'style' in attrs_dict:
            style = attrs_dict['style']
            if 'position: absolute' in style or 'position:absolute' in style:
                self.warnings.append(f"Warning: Absolute positioning in inline style on <{tag}> - may cause issues")

    def handle_endtag(self, tag):
        if tag == 'style':
            self.in_style = False

    def handle_data(self, data):
        if self.in_style:
            self.style_content.append(data)

    def analyze_css(self, css_content):
        """Analyze CSS for common Paged.js patterns and issues."""

        clean_css = CSS_COMMENT_RE.sub('', css_content)

        # Find string-set declarations
        for value in declaration_values(clean_css, 'string-set'):
            match = re.match(r'([a-zA-Z0-9_-]+)', value.strip())
            if match:
                self.string_sets.add(match.group(1))

        # Find string() uses in content
        string_use_pattern = r'string\(\s*([a-zA-Z0-9_-]+)'
        for match in re.finditer(string_use_pattern, clean_css):
            self.string_uses.add(match.group(1))

        # Find counter-reset
        self.counter_resets.update(
            counter_names(declaration_values(clean_css, 'counter-reset'))
        )

        # Find counter-increment
        self.counter_increments.update(
            counter_names(declaration_values(clean_css, 'counter-increment'))
        )

        # Find named pages
        for value in declaration_values(clean_css, 'page'):
            page_name = value.strip().split()[0]
            if page_name not in {'auto', 'initial', 'inherit', 'unset'}:
                self.page_names.add(page_name)

        # Check for @page rules
        if not re.search(r'@page\b', clean_css):
            self.warnings.append("Warning: No @page rules found - document may not be configured for print")

        # Check for size declaration
        if not declaration_values(clean_css, 'size'):
            self.warnings.append("Warning: No page size specified in @page rules")

        # Check for break properties
        has_break_properties = bool(re.search(
            r'(?<![-\w])(?:page-)?break-(?:before|after|inside)\s*:', clean_css
        ))
        if not has_break_properties:
            self.info.append("Info: No page break properties found - you may want to control page breaks")

        # Check for common issues
        if re.search(r'position\s*:\s*absolute\b', clean_css):
            self.warnings.append("Warning: Absolute positioning found - may cause layout issues with paged media")

        if re.search(r'position\s*:\s*fixed\b', clean_css):
            self.warnings.append("Warning: Fixed positioning found - may not work as expected in paged media")

        # Check for orphans and widows
        if not declaration_values(clean_css, 'orphans') and not declaration_values(clean_css, 'widows'):
            self.info.append("Info: Consider adding orphans and widows properties for better typography")

        # Check for margin box content
        has_margin_boxes = any(box in clean_css for box in [
            '@top-left', '@top-center', '@top-right',
            '@bottom-left', '@bottom-center', '@bottom-right'
        ])
        if not has_margin_boxes:
            self.info.append("Info: No margin boxes defined - consider adding headers/footers")

    def validate_cross_references(self):
        """Check for mismatches between string-set and string() usage."""

        # Check for string() without corresponding string-set
        unused_strings = self.string_uses - self.string_sets
        if unused_strings:
            for string_name in unused_strings:
                self.issues.append(f"Error: string({string_name}) used but never set with string-set")

        # Check for string-set without usage (warning only)
        unset_strings = self.string_sets - self.string_uses
        if unset_strings:
            for string_name in unset_strings:
                self.warnings.append(f"Warning: string-set defines '{string_name}' but it's never used")

        # Check for counter-increment without reset
        unreset_counters = self.counter_increments - self.counter_resets - {'page'}
        for counter in sorted(unreset_counters):
            self.warnings.append(f"Warning: counter-increment on '{counter}' but no counter-reset found")

    def report(self):
        """Print validation report."""
        print("\n" + "="*60)
        print("PAGED.JS VALIDATION REPORT")
        print("="*60)

        if self.issues:
            print("\n❌ ERRORS:")
            for issue in self.issues:
                print(f"  {issue}")
        else:
            print("\n✓ No errors found")

        if self.warnings:
            print("\n⚠️  WARNINGS:")
            for warning in self.warnings:
                print(f"  {warning}")

        if self.info:
            print("\n💡 SUGGESTIONS:")
            for info in self.info:
                print(f"  {info}")

        if self.string_sets:
            print(f"\n📝 String sets found: {', '.join(sorted(self.string_sets))}")
        if self.counter_resets:
            print(f"🔢 Counters found: {', '.join(sorted(self.counter_resets))}")
        if self.page_names:
            print(f"📄 Named pages found: {', '.join(sorted(self.page_names))}")

        print("\n" + "="*60)
        return len(self.issues) == 0


def main():
    parser = argparse.ArgumentParser(
        description='Validate Paged.js HTML/CSS for common issues'
    )
    parser.add_argument('html_file', type=Path, help='HTML file to validate')
    parser.add_argument('--css', type=Path, help='External CSS file to include')
    args = parser.parse_args()

    html_file = args.html_file
    css_file = args.css

    if not html_file.is_file():
        parser.error(f"HTML file not found: {html_file}")
    if css_file and not css_file.is_file():
        parser.error(f"CSS file not found: {css_file}")

    # Read HTML
    with open(html_file, 'r', encoding='utf-8') as f:
        html_content = f.read()

    # Parse HTML
    validator = PagedJSValidator()
    validator.feed(html_content)

    # Combine CSS from style tags
    css_content = '\n'.join(validator.style_content)

    # Add external CSS if provided
    if css_file and css_file.exists():
        with open(css_file, 'r', encoding='utf-8') as f:
            css_content += '\n' + f.read()

    # Analyze CSS
    if css_content:
        validator.analyze_css(css_content)
    else:
        validator.warnings.append("Warning: No CSS found to analyze")

    # Check cross-references
    validator.validate_cross_references()

    # Print report
    success = validator.report()

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
