import base64
import os
from io import BytesIO
from flask import Flask, request, jsonify
from openai import OpenAI
import requests
from PIL import Image
from flask_caching import Cache
from flask_cors import CORS, cross_origin
from utils import extract_json
from scale import adjust_based_on_BP
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)
app.config["CORS_HEADERS"] = "Content-Type"
app.config["CACHE_TYPE"] = "SimpleCache"
app.config["CACHE_DEFAULT_TIMEOUT"] = 3600
cache = Cache(app)

# Kimi / Ollama Cloud Config
KIMI_API_KEY = os.getenv("VITE_OLLAMA_API_KEY")
KIMI_MODEL = os.getenv("VITE_OLLAMA_MODEL", "kimi-k2.5:cloud")
# Base URL for Kimi (Moonshot) or compatible Ollama endpoint
# Since user provided a Kimi key, we use Moonshot's base URL
KIMI_BASE_URL = "https://api.moonshot.cn/v1"

client_kimi = OpenAI(
    api_key=KIMI_API_KEY,
    base_url=KIMI_BASE_URL,
)

# Prompts (P1 for Image Analysis, P2 for Stat Generation)
gpt_p1 = """
You are a battle power judgment robot, and your task is to evaluate the battle power of a given character.
Below is a reference battle power level standard:

Human: 100
Beast (Tiger, Lion): 200
Monsters (Minotaur, Scorpion-tail Lion, Centaur, etc.): 500
Elite Humans (Robin Hood, Zorro): 500
Heroes (Space Marines, Master Chief, Father Anderson): 1000
Demons (Diablo Mephisto, Hydra from Greek Mythology, Alien from Sci-Fi works, Predator): 2000
Legends (Tassadar, Kratos, Odysseus): 3000
Demigods (Dracula, Superman, Alucard, Four Horsemen of the Apocalypse, Lich King): 5000
Near Gods (Warhammer 40k Primarchs, Loki, Thor, Artemis): 10000
Gods (Satan, Warhammer 40k Emperor, The Hand of God from Berserk, Tyrant, Odin, Zeus): 20000

Next, I will upload an image. Please 

- analyze the character's origins and background 
- determine the character's battle power BP level, very carefully and as detailed as possible. 
- based to the description of BP level standard, modified the final battle power BP for about [80% - 120%].

finally, output the results in JSON format:

{
    "name": "<Character Name>",
    "description": "<Character Description>",
    "extra": "<Character Extra Background>",
    "BP": "<Battle Power>"
}
"""

gpt_p2 = """
you are a game design expert in a turn-based card game. 
You need to design character [state], and [skill] by [name], [descriptions], and battle power [BP]

Rules:

[State]
Any character has some states, which must include the following item:
"HP": "<HP>",
"MP": "<MP>",
"ATK": "<Attack>",
"DEF": "<Defense>", (Cannot exceed 80, i.e., absorb 80% of damage)
"CC": "<Crit Rate>", (Cannot exceed 100, i.e., 100% critical hit)
"SPEED": "<Speed>", (determines who acts first)
"CA": "<Crit Damage>", (Cannot exceed 100)
"PI": "<Armor Penetration>", (Cannot exceed 80)
"EV": "<Evasion>", (Cannot exceed 50, i.e., 50% chance to evade)
"AC": "<Accuracy>", (Cannot exceed 50, i.e., 150% chance to hit, counteracting enemy evasion, with a default accuracy of 100%)
"TYPE": "<Attack Effect Type>"

[BP]
BP represents a character's battle power, and the final BP must adhere to:

BP = HP + MP + 4ATK + 8DEF + 4CC + 10SPEED + 4CA + 8PI + 6EV + 4AC
HP + MP must account for 30%-60% of BP
If the BP overflows, reduce it to the expected value and scale down all attributes proportionally.

[Effect Types]
 (flesh), (magic), (thunder), (weapon), (gun), (fire), (poison), (frost), (dark), (light), (nature), (water)
This determines the special effects in the game, but has no actual effect. 
It should be based on the character's traits. Skills and attacks will have its own unique effect type.

[SKILL]
choose 2 from 3 options:
- Attack Skill
- Buff Skill
- Defense Skill

[Buff]:
Debuffs (negative effects):
(stun): Stuns the enemy for one turn
(frozen): Decreases enemy accuracy by X
(poison): Deals X damage to the enemy at the start of each turn
(corrupt): Reduces enemy armor by X

Buffs (positive effects):
(bless): Increases X attack
(heal): Restores X HP or MP (immediate or per turn)
(haste): Increases X crit rate and accuracy
(pray): Increases X attribute

All statuses must specify how many turns they last, except for stun (which lasts 1 turn). 
Choose 2 out of 3 skills based on the character’s traits and design them.

Please remember you are a expert in game design, please setup the state carefully.

output the data in JSON format:

{
"name": "<Character Name>",
"description": "<Character Description>",
"BP": "<Battle Power>",
"state": {
    "HP": "<HP>",
    "MP": "<MP>",
    "ATK": "<Attack>",
    "DEF": "<Defense>",
    "CC": "<Crit Rate>",
    "SPEED": "<Speed>",
    "CA": "<Crit Damage>",
    "PI": "<Armor Penetration>",
    "EV": "<Evasion>",
    "AC": "<Accuracy>",
    "TYPE": "<Attack Type>"
},
"skill": {
    "s1": {
        "name": "<Skill Name>",
        "description": "<Skill Description>",
        "TYPE": "<Effect Type>",
        "DMG": "<Immediate Damage>",
        "TARGET": "<Self/ally/Enemy>",
        "TARGET_NUM": "<How many unit will be targeted>",
        "BUFF_HP": "<Continuous HP Damage or Heal>",
        "BUFF_DMG": "<Continuous Attack Buff>",
        "BUFF_CC": "<Continuous Crit Rate Buff>",
        "BUFF_MP": "<Continuous MP Buff>",
        "BUFF_DEF": "<Continuous Defense Buff>",
        "BUFF_EV": "<Continuous Evasion Buff>",
        "BUFF_AC": "<Continuous Accuracy Buff>",
        "IS_STUN": "<Will it stun? Boolean value, True for stun>",
        "MP_COST": "<MP Cost>",
        "BUFF_TIME": "<Duration of Buff/Debuff>",
        "BUFF_NAME": "<stun, frozen, poison, corrupt, bless, heal, haste, pray>"
    },
    "s2": {
        "name": "<Skill Name>",
        "description": "<Skill Description>",
        "TYPE": "<Effect Type>",
        "DMG": "<Immediate Damage>",
        "TARGET": "<Self/ally/Enemy>",
        "TARGET_NUM": "<How many unit will be targeted>",
        "BUFF_HP": "<Continuous HP Damage or Heal>",
        "BUFF_DMG": "<Continuous Attack Buff>",
        "BUFF_CC": "<Continuous Crit Rate Buff>",
        "BUFF_MP": "<Continuous MP Buff>",
        "BUFF_DEF": "<Continuous Defense Buff>",
        "BUFF_EV": "<Continuous Evasion Buff>",
        "BUFF_AC": "<Continuous Accuracy Buff>",
        "IS_STUN": "<Will it stun? Boolean value, True for stun>",
        "MP_COST": "<MP Cost>",
        "BUFF_TIME": "<Duration of Buff/Debuff>",
        "BUFF_NAME": "<stun, frozen, poison, corrupt, bless, heal, haste, pray>"
    }
}
}
"""

def gpt_image(image):
    # Kimi / Moonshot currently supports vision through their latest models
    # If the provided model name is kimi-k2.5:cloud, we assume it's vision-capable
    response = client_kimi.chat.completions.create(
        model=KIMI_MODEL,
        messages=[
            {
                "role": "system",
                "content": f"{gpt_p1}",
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image['None']}"},
                    },
                ],
            },
        ],
    )

    content = response.choices[0].message.content
    print(f"Kimi Image Response: {content}")
    return extract_json(content)

def gpt_json(query):
    response = client_kimi.chat.completions.create(
        model=KIMI_MODEL,
        messages=[
            {
                "role": "system",
                "content": f"{gpt_p2}",
            },
            {
                "role": "user",
                "content": f"{query}",
            },
        ],
    )

    content = response.choices[0].message.content
    print(f"Kimi JSON Response: {content}")
    return extract_json(content)

@app.route("/upload-image", methods=["POST"])
@cross_origin()
def upload_image():
    data = request.json
    image_data = data.get("image")
    if not image_data:
        return jsonify({"error": "No image provided"}), 400

    # Step 1: Analyze image to get name and BP
    res_p1 = gpt_image(image_data)
    
    # Step 2: Generate detailed stats based on P1 result
    res_p2 = gpt_json(res_p1)
    
    # Step 3: Adjust stats to match BP formula
    final_res = adjust_based_on_BP(res_p2)
    
    return jsonify(final_res)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5544, debug=True)
