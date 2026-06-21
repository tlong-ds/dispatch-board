import xml.etree.ElementTree as ET
import glob
import json
import os

def parse_rels(rels_path):
    mapping = {}
    if not os.path.exists(rels_path):
        return mapping
    tree = ET.parse(rels_path)
    root = tree.getroot()
    for rel in root.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
        r_id = rel.get('Id')
        target = rel.get('Target')
        if target and target.startswith('../media/'):
            mapping[r_id] = os.path.basename(target)
    return mapping

def extract_shape_data(sp_node, rels_mapping, namespaces):
    data = {}
    cnvpr = sp_node.find('.//p:cNvPr', namespaces)
    if cnvpr is not None:
        data['name'] = cnvpr.get('name', 'Unknown')
    
    texts = []
    for t_node in sp_node.findall('.//a:t', namespaces):
        if t_node.text:
            texts.append(t_node.text)
    if texts:
        data['text'] = " ".join(texts)
        
    blip = sp_node.find('.//a:blip', namespaces)
    if blip is not None:
        r_id = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
        if r_id and r_id in rels_mapping:
            data['image'] = rels_mapping[r_id]
            
    return data if data else None

def main():
    slides_dir = '.tmp-pptx/ppt/slides'
    rels_dir = os.path.join(slides_dir, '_rels')
    slide_files = glob.glob(os.path.join(slides_dir, 'slide*.xml'))
    slide_files.sort()
    
    namespaces = {
        'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
        'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
        'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    }
    
    presentation_data = {}
    
    for slide_file in slide_files:
        filename = os.path.basename(slide_file)
        slide_name = filename.split('.')[0]
        
        rels_file = os.path.join(rels_dir, f"{filename}.rels")
        rels_mapping = parse_rels(rels_file)
        
        tree = ET.parse(slide_file)
        root = tree.getroot()
        
        slide_data = {"groups": [], "ungrouped_elements": []}
        
        for grp in root.findall('.//p:grpSp', namespaces):
            group_data = []
            for sp in grp.findall('.//p:sp', namespaces) + grp.findall('.//p:pic', namespaces):
                sp_data = extract_shape_data(sp, rels_mapping, namespaces)
                if sp_data:
                    group_data.append(sp_data)
            if group_data:
                grp_nv = grp.find('.//p:cNvPr', namespaces)
                grp_name = grp_nv.get('name', 'Group') if grp_nv is not None else 'Group'
                slide_data["groups"].append({"group_name": grp_name, "elements": group_data})
                
        spTree = root.find('.//p:spTree', namespaces)
        if spTree is not None:
            for child in spTree:
                tag = child.tag.split('}')[-1]
                if tag in ['sp', 'pic', 'cxnSp']:
                    sp_data = extract_shape_data(child, rels_mapping, namespaces)
                    if sp_data:
                        slide_data["ungrouped_elements"].append(sp_data)

        presentation_data[slide_name] = slide_data
        
    output_path = 'public/extracted_assets/slides_text.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(presentation_data, f, indent=2, ensure_ascii=False)
        
    print(f"Extracted grouped text and images from {len(slide_files)} slides to {output_path}")

if __name__ == '__main__':
    main()
