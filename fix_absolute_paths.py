import re

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    new_content = content.replace("url('/", "url('./")
    
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Fixed {filepath}")
    else:
        print(f"No changes in {filepath}")

fix_file('public/index.html')
fix_file('public/team.html')
