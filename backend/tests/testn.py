import re
from bs4 import BeautifulSoup
from openai import OpenAI
import requests
import sqlite3

db_path = "scihub_dois.db"


def get_doi(doi):
    doi_s = str(doi).replace(" ", "").replace("https://doi.org/", "").lower()
    return doi_s


def is_doi_in_db(db_path, doi):
    doi_s = str(doi).replace(" ", "").replace("https://doi.org/", "").lower()
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM dois WHERE doi = ?", (doi_s,))
    result = cursor.fetchone()
    conn.close()
    return result is not None


def restore_abstract(abstract_inverted_index):
    if not abstract_inverted_index:
        return "Abstract Not Available"

    # 找到所有的索引位置并按顺序排列
    inverted_index = abstract_inverted_index
    restored_abstract = []

    # 遍历所有倒排索引中的单词
    for word, positions in inverted_index.items():
        # 如果位置是整数类型，才加入排序列表
        if isinstance(positions, list):
            for position in positions:
                # 确保只有整数类型的位置才添加
                if isinstance(position, int):
                    restored_abstract.append((position, word))

    # 按照位置对所有单词进行排序
    restored_abstract.sort(key=lambda x: x[0])

    # 拼接排序后的单词，生成完整的 abstract
    final_abstract = " ".join(
        [str(word) for _, word in restored_abstract]
    )  # 将每个单词转换为字符串
    return final_abstract


# 调用函数还原 abstract
# print(restore_abstract(abstract_inverted_index['abstract_inverted_index']))


def extract_source_names(locations):
    data = []
    if isinstance(locations, str):
        return locations
    if locations is None:
        return "Not Available"
    # 提取所有的 source.display_name
    for location in locations:
        try:
            data.append(location.get("source").get("display_name"))
        except:
            data.append("Not Available")

    if data == []:
        data.append("Not Available")

    # 将所有的 source.display_name 连接成一个字符串
    return ", ".join(data[:1])


def fetch_openalex_papers(search_term, per_page, oa, page=1):
    if oa == True:
        url = f"https://api.openalex.org/works?search={search_term}&filter=open_access.is_oa:true&per-page={per_page}&page={page}&sort=relevance_score:desc"
    else:
        url = f"https://api.openalex.org/works?search={search_term}&per-page={per_page}&page={page}&sort=relevance_score:desc"
    response = requests.get(url)

    if response.status_code != 200:
        return {"error": "Failed to fetch data from OpenAlex"}

    data = response.json()
    papers = []

    for paper in data.get("results", []):
        # 获取摘要
        abstract = restore_abstract(paper.get("abstract_inverted_index", {}))

        # 处理作者信息
        authors = [
            author["author"].get("display_name", "Unknown")
            for author in paper.get("authorships", [])
        ]

        # 整理成指定格式
        paper_info = {
            "source": "a",  # 你可以根据实际情况修改这个值
            "title": paper.get("title", "Unknown"),
            "doi": paper.get("doi", "Unknown"),
            "abstract": abstract,
            "referencecount": paper.get("cited_by_count", 0),
            "author": (", ".join(authors) if authors else "Unknown"),
            "year": paper.get("publication_year", "Unknown"),
            "url": paper.get("doi", "Unknown"),
            "location": extract_source_names(paper.get("locations", "Not Available")),
            "scihub_url": paper.get("doi", "Unknown"),
        }

        # print(paper_info["title"])
        # print(str(paper_info["doi"]).replace(" ","").replace("https://doi.org/","").lower())
        # print(is_doi_in_db(db_path, paper_info["doi"]))
        if is_doi_in_db(db_path, paper_info["doi"]):
            paper_info["source"] = "s"
            paper_info["url"] = "https://sci-hub.se/" + get_doi(paper_info["doi"])
            paper_info["scihub_url"] = "https://sci-hub.se/" + get_doi(
                paper_info["doi"]
            )

        papers.append(paper_info)

    return papers


def get_paper_info(doi):
    url = f"https://api.openalex.org/works/doi:{doi}"
    response = requests.get(url)

    if response.status_code != 200:
        return {"error": "Failed to fetch data from OpenAlex"}

    paper = response.json()

    # 获取摘要
    abstract = restore_abstract(paper.get("abstract_inverted_index", {}))

    # 处理作者信息
    authors = [
        author["author"].get("display_name", "Unknown")
        for author in paper.get("authorships", [])
    ]

    # 整理成指定格式
    paper_info = {
        "source": "a",  # 你可以根据实际情况修改这个值
        "title": paper.get("title", "Unknown"),
        "doi": doi,
        "abstract": abstract,
        "referencecount": paper.get("cited_by_count", 0),
        "author": (", ".join(authors) if authors else "Unknown"),
        "year": paper.get("publication_year", "Unknown"),
        "url": "https://www.doi.org/" + str(doi),
        "location": extract_source_names(paper.get("locations", "Not Available")),
        "scihub_url": "https://www.doi.org/" + str(doi),
    }

    if is_doi_in_db(db_path, doi):
        paper_info["source"] = "s"
        paper_info["url"] = "https://sci-hub.se/" + str(doi)
        paper_info["scihub_url"] = "https://sci-hub.se/" + str(doi) 

    return paper_info


def fetch_openalex_papers_first(search_term, per_page=10, page=1):
    url = f"https://api.openalex.org/works?search={search_term}&per-page={per_page}&page={page}&sort=relevance_score:desc"
    response = requests.get(url)

    if response.status_code != 200:
        return {"error": "Failed to fetch data from OpenAlex"}

    data = response.json()
    papers = []

    for paper in data.get("results", []):
        # 获取摘要
        abstract = restore_abstract(paper.get("abstract_inverted_index", {}))

        # 处理作者信息
        authors = [
            author["author"].get("display_name", "Unknown")
            for author in paper.get("authorships", [])
        ]

        # 整理成指定格式
        paper_info = {
            "source": "a",  # 你可以根据实际情况修改这个值
            "title": paper.get("title", "Unknown"),
            "doi": paper.get("doi", "Unknown"),
            "abstract": abstract,
            "referencecount": paper.get("cited_by_count", 0),
            "author": (", ".join(authors) if authors else "Unknown"),
            "year": paper.get("publication_year", "Unknown"),
            "url": paper.get("doi", "Unknown"),
            "location": extract_source_names(paper.get("locations", "Not Available")),
            "scihub_url": paper.get("doi", "Unknown"),
        }

        # print(paper_info["title"])
        # print(str(paper_info["doi"]).replace(" ","").replace("https://doi.org/","").lower())
        # print(is_doi_in_db(db_path, paper_info["doi"]))
        if is_doi_in_db(db_path, paper_info["doi"]):
            paper_info["source"] = "s"
            paper_info["url"] = "https://sci-hub.se/" + get_doi(paper_info["doi"])
            paper_info["scihub_url"] = "https://sci-hub.se/" + get_doi(
                paper_info["doi"]
            )

        papers.append(paper_info)

    return papers


# print(is_doi_in_db(db_path,"10.3233/JAE-171169"))

# # 示例调用
# res = trans_ollama(
#     "natural drugs with inhibitory effects on hypoxic hepatocellular carcinoma"
# )
# print(res)
# papers = fetch_openalex_papers(res, 5, 1)

# # 输出整理后的数据
# for paper in papers:
#     print(paper)

# client = OpenAI(
#     api_key="CONFIGURE_LOCALLY", base_url="https://api.deepseek.com"
# )

# response = client.chat.completions.create(
#     model="deepseek-chat",
#     messages=[
#         {"role": "system", "content": "You are a helpful assistant"},
#         {"role": "user", "content": "Hello"},
#     ],
#     stream=False
# )

# print(response.choices[0].message.content)
print(get_paper_info("10.1016/b978-0-08-042367-8.50071-9")["error"])
