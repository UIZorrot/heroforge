import re
import json

def extract_json(text):
    # 使用正则表达式查找 JSON 字符串
    json_match = re.search(r'\{.*\}', text, re.DOTALL)
    
    if json_match:
        json_str = json_match.group(0)
        try:
            # 尝试将字符串解析为 JSON
            json_data = json.loads(json_str)
            return json_data
        except json.JSONDecodeError:
            print("无法解析为有效的JSON")
            return None
    else:
        print("未找到 JSON 数据")
        return None

# # 示例文本
# text = """
# - **Name:** Dante
# - **Origin:** *Devil May Cry* series (video games, anime, and other media)
# - **Background:** Dante is the son of the demon Sparda and a human mother, which gives him a hybrid nature. He inherits powerful demon abilities alongside his human skills, making him an incredibly formidable fighter. Throughout the series, he battles demons, with his skills in combat and his powerful arsenal of weapons (such as Ebony & Ivory, Rebellion, and Sparda) as a key feature of his abilities.
# json
# {
#     "name": "Dante",
#     "description": "Dante is the son of the demon Sparda and a human, making him a half-demon. He is an expert demon hunter with extraordinary combat abilities, including enhanced strength, speed, regeneration, and a wide range of powerful weapons. Throughout the *Devil May Cry* series, he battles demonic forces and god-like beings, showcasing immense power and skill.",
#     "BP": "5500"
# }
# """

# # 提取 JSON 数据
# json_data = extract_json(text)

# if json_data:
#     print(json_data)
