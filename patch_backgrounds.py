import re

def update_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Update road backgrounds to center
    content = content.replace("repeat-x bottom left /", "repeat-x bottom center /")
    content = content.replace("repeat-x top left /", "repeat-x top center /")

    # 2. Replace CSS for dino, cactus, cloud
    # We will find the block starting with .bg-dino and ending before </style> or the next major block.
    # Actually, let's use regex to replace everything from .bg-dino { ... to .bg-cloud { ... }
    
    css_to_replace = re.search(r'\.bg-dino\s*{.*?(?:</style>|@media)', content, flags=re.DOTALL)
    
    if css_to_replace:
        new_css = """    .bg-dino {
      position: absolute;
      bottom: 35px;
      left: calc(50% - 400px);
      width: 110px;
      height: 117px;
      background: url('/extracted_assets/media/image2.svg') no-repeat center center / contain;
      z-index: 9999;
    }
    .bg-dino.jumping {
      animation: jump 0.5s ease-out;
    }
    @keyframes jump {
      0% { bottom: 35px; }
      50% { bottom: 135px; }
      100% { bottom: 35px; }
    }
    .bg-cactus-small {
      position: absolute;
      bottom: 35px;
      width: 50px;
      height: 75px;
      background: url('/extracted_assets/media/image8.svg') no-repeat center center / contain;
      z-index: 9999;
    }
    .bg-cactus-large {
      position: absolute;
      bottom: 35px;
      width: 85px;
      height: 125px;
      background: url('/extracted_assets/media/image7.png') no-repeat center bottom / contain;
      z-index: 9999;
    }
    .bg-cloud-1 {
      position: absolute;
      top: 50px;
      left: calc(50% - 450px);
      width: 100px;
      height: 60px;
      background: url('/extracted_assets/media/image3.svg') no-repeat center center / contain;
      opacity: 0.7;
      animation: float 25s linear infinite;
    }
    .bg-cloud-2 {
      position: absolute;
      top: 80px;
      left: calc(50% + 100px);
      width: 120px;
      height: 70px;
      background: url('/extracted_assets/media/image4.svg') no-repeat center center / contain;
      opacity: 0.5;
      animation: float 30s linear infinite reverse;
    }
    .bg-cloud-3 {
      position: absolute;
      top: 40px;
      left: calc(50% + 350px);
      width: 90px;
      height: 50px;
      background: url('/extracted_assets/media/image3.svg') no-repeat center center / contain;
      opacity: 0.8;
      animation: float 22s linear infinite;
    }
    @keyframes float {
      0% { transform: translateX(0); }
      50% { transform: translateX(20px); }
      100% { transform: translateX(0); }
    }
"""
        
        # We need to make sure we don't accidentally replace the closing </style>
        # So we'll replace the matched section up to the first @keyframes float or similar
        # Let's do it with a more targeted regex.
        pass

update_file('public/index.html')
update_file('public/team.html')
