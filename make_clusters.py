import re

def update_clouds(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Replace the old cloud CSS with the new cluster CSS
    css_pattern = r'\.bg-cloud-1.*?@keyframes float'
    new_css = """.cloud-cluster-1 {
      position: absolute;
      top: 40px;
      width: 250px;
      height: 100px;
      animation: float 40s linear infinite;
      z-index: 0;
    }
    .cloud-cluster-2 {
      position: absolute;
      top: 70px;
      width: 300px;
      height: 120px;
      animation: float 55s linear infinite 20s;
      z-index: 0;
    }
    .cloud-cluster-3 {
      position: absolute;
      top: 20px;
      width: 200px;
      height: 90px;
      animation: float 30s linear infinite 10s;
      z-index: 0;
    }
    .cloud-part-1 {
      position: absolute;
      top: 15px;
      left: 0;
      width: 100px;
      height: 60px;
      background: url('/extracted_assets/media/image3.svg') no-repeat center center / contain;
      opacity: 0.8;
    }
    .cloud-part-2 {
      position: absolute;
      top: 0;
      left: 60px;
      width: 140px;
      height: 80px;
      background: url('/extracted_assets/media/image4.svg') no-repeat center center / contain;
      opacity: 0.6;
    }
    .cloud-part-3 {
      position: absolute;
      top: 25px;
      left: 150px;
      width: 90px;
      height: 50px;
      background: url('/extracted_assets/media/image3.svg') no-repeat center center / contain;
      opacity: 0.9;
    }
    @keyframes float"""
    
    content = re.sub(css_pattern, new_css, content, flags=re.DOTALL)
    
    # Replace the DOM elements
    dom_pattern = r'<div class="bg-cloud-1"></div>\s*<div class="bg-cloud-2"></div>\s*<div class="bg-cloud-3"></div>'
    new_dom = """<div class="cloud-cluster-1" style="transform: translateX(100vw);">
  <div class="cloud-part-1"></div>
  <div class="cloud-part-2"></div>
  <div class="cloud-part-3"></div>
</div>
<div class="cloud-cluster-2" style="transform: translateX(100vw);">
  <div class="cloud-part-2" style="left: 0; top: 10px;"></div>
  <div class="cloud-part-1" style="left: 100px; top: 0;"></div>
</div>
<div class="cloud-cluster-3" style="transform: translateX(100vw);">
  <div class="cloud-part-3" style="left: 0; top: 10px;"></div>
  <div class="cloud-part-1" style="left: 50px; top: 0;"></div>
  <div class="cloud-part-2" style="left: 110px; top: 15px;"></div>
</div>"""
    
    content = re.sub(dom_pattern, new_dom, content)
    
    with open(filepath, 'w') as f:
        f.write(content)

update_clouds('public/index.html')
update_clouds('public/team.html')
