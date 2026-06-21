import xml.etree.ElementTree as ET

svg_str = """<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="483.92" height="45" viewBox="181.9 465 483.92 45" preserveAspectRatio="none" version="1">
  <g fill="#535454">
    <!-- Continuous line (starts at 181.9, ends at 600, thickness 8, bottom 506) -->
    <path d="M600,506 H181.9 v-8 h418.1 z"/>
    <!-- Bump from image10 (top 1/6th) positioned EXACTLY after the line -->
    <g transform="translate(557.91, 480.365) scale(0.3)">
      <path d="M250 58.02L277.43 58.02 304.85 58.02 304.85 30.6 277.43 30.6 250 30.6 222.58 30.6 195.15 30.6 195.15 58.02 222.58 58.02 250 58.02z"/>
      <path d="M332.27 85.45L359.7 85.45 359.7 58.02 332.27 58.02 304.85 58.02 304.85 85.45 332.27 85.45z"/>
      <path d="M195.15 85.45L195.15 58.02 167.73 58.02 140.3 58.02 140.3 85.45 167.73 85.45 195.15 85.45z"/>
    </g>
  </g>
</svg>
"""

with open('public/extracted_assets/media/image12.svg', 'w') as f:
    f.write(svg_str)
