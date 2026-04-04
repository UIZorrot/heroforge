Backend Generation Split

This backend uses two separate stages:

1. LLM stage
The LLM is part of the backend, but it only makes structural decisions.
It must output:
- character name
- character description
- battle power BP
- a stat template, such as knight, warrior, assassin, mage, ranger, or tank
- stat weights from 1 to 10
- skill names, descriptions, targets, ranges, and effect tags
- 0/1 markers for numeric skill fields

2. Numeric generator stage
This stage is pure rule-based logic.
It has no AI component.
It converts the template, BP, and weights into final numbers with randomness constrained by the template.
It also converts the 0/1 skill markers into final skill values.

Skill field contract

"ROLE": "<attack|buff|defense>"
"IS_PASSIVE": "<true or false>"
"name": "<Skill Name>"
"description": "<Skill Description>"
"TYPE": "<Effect Type>"
"TARGET": "<Self/ally/Enemy>"
"TARGET_NUM": "<How many units will be targeted>"
"RANGE": "<melee|ranged|self|ally|enemy>"
"IS_STUN": "<true or false>"
"BUFF_TIME": "<Duration of Buff/Debuff>"
"BUFF_NAME": "<weakness, wound, stun, curse, bless, heal>"
"DMG": "<0 or 1>"
"BUFF_HP": "<0 or 1>"
"BUFF_MP": "<0 or 1>"
"BUFF_DMG": "<0 or 1>"
"BUFF_CC": "<0 or 1>"
"BUFF_DEF": "<0 or 1>"
"BUFF_EV": "<0 or 1>"
"BUFF_AC": "<0 or 1>"

Status mapping used by the battle engine:
- weakness reduces attack
- wound deals damage over time
- curse reduces defense
- stun skips a turn
- bless increases attack
- heal restores HP or MP

Compatibility aliases:
- poison -> wound
- corrupt -> curse
- vulnerable -> weakness
