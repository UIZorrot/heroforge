def calculate_actual_BP(state):
    # 根据公式计算实际的BP
    HP = int(state['HP'])
    MP = int(state['MP'])
    ATK = int(state['ATK'])
    DEF = int(state['DEF'])
    CC = int(state['CC'])
    SPEED = int(state['SPEED'])
    CA = int(state['CA'])
    PI = int(state['PI'])
    EV = int(state['EV'])
    AC = int(state['AC'])
    
    # 计算实际BP
    actual_BP = HP + MP + 4 * ATK + 8 * DEF + 4 * CC + 10 * SPEED + 4 * CA + 8 * PI + 6 * EV + 4 * AC
    return actual_BP

def adjust_based_on_BP(character_json):
    # 提取原始BP和state
    try:
        original_BP = int(character_json['BP'])
    except (ValueError, TypeError, KeyError):
        original_BP = 1000
        
    state = character_json.get('state', {})
    skills = character_json.get('skill', {})
    
    # 计算实际BP
    actual_BP = calculate_actual_BP(state)
    
    # 计算BP的差异比例
    BP_diff = original_BP / actual_BP if actual_BP != 0 else 1
    
    # 根据BP差异比例调整state中的数值
    adjusted_state = {}
    for key, value in state.items():
        # 尝试转换为数值并调整
        try:
            if key == 'TYPE':
                adjusted_state[key] = value
                continue
            
            num_val = float(value)
            adjusted_state[key] = int(num_val * BP_diff)
        except (ValueError, TypeError):
            adjusted_state[key] = value
    
    # 根据差异调整Buff和Debuff的数值效果
    adjusted_skills = {}
    for skill_key, skill in skills.items():
        adjusted_skill = skill.copy()  # 创建技能的副本，避免修改原始对象
        
        # 列表需要调整的数值字段
        numeric_fields = ['DMG', 'BUFF_HP', 'BUFF_DMG', 'BUFF_CC', 'BUFF_MP', 'BUFF_DEF', 'BUFF_EV', 'BUFF_AC', 'MP_COST']
        
        for field in numeric_fields:
            if field in skill:
                try:
                    num_val = float(skill[field])
                    adjusted_skill[field] = int(num_val * BP_diff)
                except (ValueError, TypeError):
                    pass # Keep original if not numeric
        
        # 确保 IS_STUN 是字符串 "True"/"False" 或者 boolean
        if 'IS_STUN' in adjusted_skill:
            val = adjusted_skill['IS_STUN']
            if isinstance(val, bool):
                adjusted_skill['IS_STUN'] = "True" if val else "False"

        adjusted_skills[skill_key] = adjusted_skill
    
    # 调整后的结果
    character_json['state'] = adjusted_state
    character_json['skill'] = adjusted_skills
    character_json['BP'] = original_BP # Keep the original target BP
    
    return character_json

# 例如应用在Space Marine的示例上：
space_marine = {
    "name": "Space Marine",
    "description": "A genetically enhanced super-soldier...",
    "BP": 1500,
    "state": {
        "HP": "208",
        "MP": "33",
        "ATK": "54",
        "DEF": "29",
        "CC": "12",
        "SPEED": "37",
        "CA": "29",
        "PI": "20",
        "EV": "8",
        "AC": "12",
        "TYPE": "weapon"
    },
    "skill": {
        "s1": {
            "name": "Boltgun Barrage",
            "description": "Fires a rapid stream of high-caliber bolts...",
            "TYPE": "weapon",
            "DMG": "120",
            "BUFF_HP": "0",
            "BUFF_DMG": "0",
            "BUFF_CC": "0",
            "BUFF_MP": "0",
            "BUFF_DEF": "0",
            "BUFF_EV": "0",
            "BUFF_AC": "0",
            "IS_STUN": "False",
            "MP_COST": "40",
            "BUFF_TIME": "0",
            "BUFF_NAME": ""
        },
        "s2": {
            "name": "Astartes Precision Strike",
            "description": "A focused strike that deals massive damage...",
            "TYPE": "weapon",
            "DMG": "200",
            "BUFF_HP": "0",
            "BUFF_DMG": "0",
            "BUFF_CC": "0",
            "BUFF_MP": "0",
            "BUFF_DEF": "0",
            "BUFF_EV": "0",
            "BUFF_AC": "0",
            "IS_STUN": "True",
            "MP_COST": "60",
            "BUFF_TIME": "1",
            "BUFF_NAME": "stun"
        }
    }
}

# 调用函数调整人物
adjusted_space_marine = adjust_based_on_BP(space_marine)
print(adjusted_space_marine)
