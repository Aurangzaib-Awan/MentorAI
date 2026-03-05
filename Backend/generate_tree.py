import os

def generate_markdown_tree(startpath, ignore_dirs):
    tree_lines = ["# Immersia Project Structure\n", "```text"]
    
    for root, dirs, files in os.walk(startpath):
        # Exclude specified directories
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        dirs.sort()  # Sort for consistent order
        
        # Calculate level offset
        level = root.replace(startpath, '').count(os.sep)
        indent = '│   ' * level
        
        folder_name = os.path.basename(root)
        if level > 0:
            tree_lines.append(f"{indent}├── {folder_name}/")
        else:
            tree_lines.append(f"{folder_name}/")
            
        subindent = '│   ' * (level + 1)
        files.sort()
        for i, f in enumerate(files):
            tree_lines.append(f"{subindent}├── {f}")
            
    tree_lines.append("```\n")
    return '\n'.join(tree_lines)

ignore_dirs = {'.git', 'node_modules', 'venv', 'fastapi_env', '__pycache__', '.pytest_cache', 'dist', 'build', '.idea', '.vscode'}
tree_text = generate_markdown_tree(r'c:\Users\asiif\Downloads\Immersia', ignore_dirs)

# Write to the AI brain artifact directory so it's saved as an artifact
with open(r'C:\Users\asiif\.gemini\antigravity\brain\f9190fa2-a47b-4c6b-bfef-bf4c4c39f74c\project_structure.md', 'w', encoding='utf-8') as f:
    f.write(tree_text)
