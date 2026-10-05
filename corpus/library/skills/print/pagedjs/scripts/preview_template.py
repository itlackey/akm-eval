#!/usr/bin/env python3
"""
Generate a minimal Paged.js preview HTML for testing CSS.

Usage:
    python preview_template.py --output preview.html
    python preview_template.py --css styles.css --output preview.html
"""

import argparse
import os
from html import escape
from pathlib import Path


TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Paged.js Preview</title>
    <script src="https://unpkg.com/pagedjs@0.4.3/dist/paged.polyfill.js"></script>
    <style>
        /* Base print styles */
        @page {
            size: A4;
            margin: 2cm;
        }

        /* Preview styling for screen */
        @media screen {
            body {
                background: #eee;
                margin: 0;
                padding: 20px;
            }

            .pagedjs_pages {
                display: flex;
                flex-direction: column;
                align-items: center;
            }

            .pagedjs_page {
                background: white;
                box-shadow: 0 0 10px rgba(0,0,0,0.2);
                margin: 1cm auto;
            }
        }

        /* Typography defaults */
        body {
            font-family: Georgia, serif;
            font-size: 11pt;
            line-height: 1.6;
        }

        h1 {
            font-size: 24pt;
            margin: 2em 0 1em 0;
            break-after: avoid;
        }

        h2 {
            font-size: 18pt;
            margin: 1.5em 0 0.5em 0;
            break-after: avoid;
        }

        h3 {
            font-size: 14pt;
            margin: 1em 0 0.5em 0;
            break-after: avoid;
        }

        p {
            margin: 0 0 1em 0;
            orphans: 3;
            widows: 3;
        }

        /* Prevent awkward breaks */
        h1, h2, h3, h4, h5, h6 {
            break-inside: avoid;
            page-break-inside: avoid;
        }

        img, figure, table {
            break-inside: avoid;
            page-break-inside: avoid;
        }

    </style>
    <!-- {CSS_LINK} -->
</head>
<body>
    <h1>Chapter 1: Sample Content</h1>

    <p>This is a sample document for testing Paged.js layouts. Lorem ipsum dolor sit amet,
    consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>

    <h2>Section 1.1: Introduction</h2>

    <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
    commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore
    eu fugiat nulla pariatur.</p>

    <p>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit
    anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium
    doloremque laudantium.</p>

    <h2>Section 1.2: Details</h2>

    <p>Totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae
    vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit
    aut fugit.</p>

    <h3>Subsection 1.2.1</h3>

    <p>Sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro
    quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit.</p>

    <p>Sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat
    voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit
    laboriosam.</p>

    <h1>Chapter 2: More Content</h1>

    <p>At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium
    voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati
    cupiditate non provident.</p>

    <h2>Section 2.1: Examples</h2>

    <p>Similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga.
    Et harum quidem rerum facilis est et expedita distinctio.</p>

    <p>Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id
    quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus.</p>

    <p>Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet
    ut et voluptates repudiandae sint et molestiae non recusandae.</p>

    <h2>Section 2.2: Conclusion</h2>

    <p>Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores
    alias consequatur aut perferendis doloribus asperiores repellat. Lorem ipsum dolor sit amet,
    consectetur adipiscing elit.</p>

    <p>Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam,
    quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
</body>
</html>
"""


def main():
    parser = argparse.ArgumentParser(description='Generate Paged.js preview HTML')
    parser.add_argument('--css', help='Path to CSS file to include')
    parser.add_argument('--output', default='preview.html', help='Output HTML file')

    args = parser.parse_args()

    html = TEMPLATE
    output_file = Path(args.output)

    # Include external CSS if provided
    if args.css:
        css_file = Path(args.css)
        if not css_file.is_file():
            parser.error(f"CSS file not found: {args.css}")
        css_href = os.path.relpath(
            css_file.resolve(), start=output_file.resolve().parent
        ).replace(os.sep, "/")
        css_link = f'<link rel="stylesheet" href="{escape(css_href, quote=True)}">'
        html = html.replace('<!-- {CSS_LINK} -->', css_link)
        print(f"✓ Including CSS from: {css_file}")
    else:
        html = html.replace('<!-- {CSS_LINK} -->', '')

    # Write output
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"✓ Preview HTML generated: {output_file}")
    print(f"  Open in browser to test with Paged.js")


if __name__ == '__main__':
    main()
