import xml.etree.ElementTree as ET

tree = ET.parse('public/extracted_assets/media/image6.svg')
root = tree.getroot()

# The SVG namespace
ns = {'svg': 'http://www.w3.org/2000/svg'}
ET.register_namespace('', ns['svg'])

for g in root.findall('.//svg:g', ns):
    fill = g.get('fill')
    if fill and fill.lower() == '#f7f7f7':
        # Remove this element from its parent
        # We need to find the parent to remove it
        pass

# A simpler way using regex to strip out the f7f7f7 groups
import re
with open('public/extracted_assets/media/image6.svg', 'r') as f:
    content = f.read()

# image6.svg structure:
# <g fill="#f7f7f7" id="changeX_1">...</g>
# We can use regex to remove these groups
content = re.sub(r'<g fill="#f7f7f7"[^>]*>.*?</g>', '', content, flags=re.DOTALL)

with open('public/extracted_assets/media/image6.svg', 'w') as f:
    f.write(content)
