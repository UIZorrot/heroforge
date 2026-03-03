import re
import ollama
from ollama import generate

import glob
import pandas as pd
from PIL import Image

import os
from io import BytesIO


def remove_think_tags(text):
    try:
        # 去掉 <think> 标签和它内部的内容
        cleaned_text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
        # 去掉剩余部分的 \n\n
        cleaned_text = re.sub(r"\n{2,}", "\n", cleaned_text)
        return cleaned_text.strip()
    except:
        return "Not Available"


def get_think_tags(text):
    # 提取 <think></think> 标签中的内容，去掉标签
    think_content = re.findall(r"<think>(.*?)</think>", text, flags=re.DOTALL)
    if think_content:
        return think_content[0].strip()  # 返回第一个匹配的内容
    else:
        return "Not Available"  # 如果没有找到 <think></think> 标签，返回空字符串


def paragraph_to_json_ollama(query):
    # 使用 ollama API 进行段落分解
    response = ollama.chat(
        model="deepseek-r1:8b",
        messages=[
            {
                "role": "system",
                "content": f"""
                    Your task is to identify the characters described in [query] and rate their combat strength.

                    First, based on the description, identify how many main characters there are.
                    Next, describe each character’s identity.
                    Finally, rate the combat strength of each character.
                    Known standards:

                    An normal adult male without weapons has a combat strength of 100 points.
                    An normal adult tiger or lion has a combat strength of 200 points.
                    An Alien (from the movie) has a combat strength of approximately 10,000. It has combat abilities far beyond normal creatures, but if 10 armed men are not ambushed, they should be able to defeat it.
                    A Transformer (from the movie) has an average combat strength of approximately 50,000. They cannot be defeated by conventional weapons, so they are not something normal humans can handle, but aliens possess strong combat abilities, and if the numbers are sufficient, they might be able to defeat the Autobots.
                """,
            },
            {
                "role": "user",
                "content": f"[query]: {query}",
            },
        ],
    )

    # 从响应中提取模型返回的文本
    model_response = response["message"]["content"]

    res = {
        "sum": remove_think_tags(str(model_response)).replace("<think>", ""),
        "cot": get_think_tags(str(model_response)),
    }

    # 返回结果为JSON格式
    return model_response


# Load the DataFrame from a CSV file, or create a new one if the file doesn't exist
def load_or_create_dataframe(filename):
    if os.path.isfile(filename):
        df = pd.read_csv(filename)
    else:
        df = pd.DataFrame(columns=["image_file", "description"])
    return df


df = load_or_create_dataframe("image_descriptions.csv")


def get_png_files(folder_path):
    return glob.glob(f"{folder_path}/*.png")


# get the list of image files in the folder yopu want to process
image_files = get_png_files("./")
image_files.sort()

print(image_files[:3])
print(df.head())


# processing the images
def process_image(image_file):
    print(f"\nProcessing {image_file}\n")
    with Image.open(image_file) as img:
        with BytesIO() as buffer:
            img.save(buffer, format="PNG")
            image_bytes = buffer.getvalue()

    full_response = ""
    # Generate a description of the image
    response = generate(
        model="llama3.2-vision:latest",
        prompt="describe this image and make sure to include anything notable about it (include text you see in the image)",
        images=[image_bytes],
    )
    # Print the response to the console and add it to the full response
    print(response["response"])
    res = paragraph_to_json_ollama(response["response"])
    print(res)
    full_response += res

    # Add a new row to the DataFrame
    df.loc[len(df)] = [image_file, full_response]


for image_file in image_files:
    if image_file not in df["image_file"].values:
        process_image(image_file)

# Save the DataFrame to a CSV file
# df.to_csv("image_descriptions.csv", index=False)
