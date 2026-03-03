import { extractJson, adjustBasedOnBP } from './gameLogic';
import type { CharacterData } from './gameLogic';

const MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'kimi-k2.5:cloud';
const BASE_URL = import.meta.env.VITE_OLLAMA_BASE_URL || '/api/ollama';

interface ForgeMaterialsInput {
  glowGem?: number;
  chaosMind?: number;
  emberCore?: number;
  frostShard?: number;
  stormSigil?: number;
  voidDust?: number;
  [key: string]: number | undefined;
}

const P1_PROMPT = `
You are a battle power judgment robot, and your task is to evaluate the battle power of a given character.
Below is a reference battle power level standard:

Human: 100
Beast (Tiger, Lion): 200
Monsters (Minotaur, Scorpion-tail Lion, Centaur, etc.): 500
Elite Humans (Robin Hood, Zorro): 500
Heroic (Space Marines, Master Chief, Father Anderson, Alien from Sci-Fi works, Predator): 1000
Demons (Diablo Mephisto, Hydra from Greek Mythology): 2000
Legends (Tassadar, Hulk): 3000
Demigods (Dracula, Superman, Alucard, Four Horsemen of the Apocalypse, Lich King): 5000
Near Gods (Warhammer 40k Primarchs, Loki, Thor, Artemis, Kratos): 10000
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
`;

const P2_PROMPT = `
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
`;

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
}

function buildMaterialDirective(materials: ForgeMaterialsInput) {
  const normalized = Object.entries(materials)
    .map(([key, amount]) => [key, Math.max(0, Number(amount ?? 0))] as const)
    .filter(([, amount]) => amount > 0);
  if (normalized.length === 0) {
    return 'No special forging materials. Keep neutral style and balanced stat distribution.';
  }
  const directives: Record<string, string> = {
    glowGem: 'bias style and skills toward light, precision, speed, and control stability.',
    chaosMind: 'bias style and skills toward dark, burst, volatility, and aggressive effects.',
    emberCore: 'bias style and skills toward fire, damage-over-time pressure, and offensive momentum.',
    frostShard: 'bias style and skills toward frost, survivability, slowing control, and defensive consistency.',
    stormSigil: 'bias style and skills toward thunder, chain impact, acceleration, and burst tempo.',
    voidDust: 'bias style and skills toward void, disruption, armor-pierce, and evasive unpredictability.',
  };
  const labels: Record<string, string> = {
    glowGem: 'Luminous Gem',
    chaosMind: 'Chaos Mind',
    emberCore: 'Ember Core',
    frostShard: 'Frost Shard',
    stormSigil: 'Storm Sigil',
    voidDust: 'Void Dust',
  };
  const notes: string[] = normalized.map(([key, amount]) => {
    const name = labels[key] ?? key;
    const effect = directives[key] ?? 'nudge theme and attributes to reflect this special material.';
    return `${name} x${amount}: ${effect}`;
  });
  return notes.join(' ');
}

export async function forgeHero(imageFile: File, materials: ForgeMaterialsInput = {}): Promise<CharacterData> {
  const base64Image = await fileToBase64(imageFile);
  const headers = {
    'Content-Type': 'application/json'
  };
  const materialDirective = buildMaterialDirective(materials);

  // Step 1: Analyze Image (Ollama Vision API)
  const p1Response = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [
        { role: 'system', content: P1_PROMPT },
        {
          role: 'user',
          content: 'Analyze this character image and return JSON only.',
          images: [base64Image]
        }
      ]
    })
  });
  if (!p1Response.ok) {
    throw new Error(`Ollama vision request failed: ${p1Response.status}`);
  }
  const p1Result = await p1Response.json();
  const p1Content = p1Result?.message?.content;
  const p1Data = extractJson(p1Content);
  if (!p1Data) throw new Error("Failed to analyze image");

  // Step 2: Generate Stats (Ollama Chat API)
  const p2Response = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [
        { role: 'system', content: P2_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            source: p1Data,
            materials: Object.fromEntries(
              Object.entries(materials).map(([key, amount]) => [key, Math.max(0, Number(amount ?? 0))])
            ),
            directive: materialDirective
          })
        }
      ]
    })
  });
  if (!p2Response.ok) {
    throw new Error(`Ollama stat request failed: ${p2Response.status}`);
  }
  const p2Result = await p2Response.json();
  const p2Content = p2Result?.message?.content;
  const p2Data = extractJson(p2Content);
  if (!p2Data) throw new Error("Failed to generate stats");

  // Step 3: Scale and Adjust
  return adjustBasedOnBP(p2Data);
}
