import random

# 初始化角色数据
doom_slayer = {
    "name": "DOOM Slayer",
    "HP": 600,
    "MP": 100,
    "ATK": 800,
    "DEF": 80,
    "CC": 50,  # 暴击率
    "SPEED": 100,
    "CA": 50,  # 暴击伤害
    "PI": 60,  # 护甲穿透
    "EV": 30,  # 闪避率
    "AC": 50,  # 命中率
    "skill": {
        "s1": {
            "name": "Super Shotgun Blast",
            "description": "使用超级霰弹枪进行攻击，造成巨大的即时伤害。",
            "DMG": 1200,
            "BUFF_HP": 0,
            "BUFF_DMG": 0,
            "BUFF_CC": 0,
            "BUFF_MP": 0,
            "BUFF_DEF": 0,
            "BUFF_EV": 0,
            "BUFF_AC": 0,
            "IS_STUN": True,
            "MP_COST": 50,
            "BUFF_TIME": 1,
            "BUFF_NAME": "Stun"
        },
        "s2": {
            "name": "Glory Kill",
            "description": "用近战攻击敌人并造成巨大的暴击伤害，同时恢复部分生命值。",
            "DMG": 1000,
            "BUFF_HP": 200,
            "BUFF_DMG": 0,
            "BUFF_CC": 0,
            "BUFF_MP": 0,
            "BUFF_DEF": 0,
            "BUFF_EV": 0,
            "BUFF_AC": 0,
            "IS_STUN": False,
            "MP_COST": 0,
            "BUFF_TIME": 1,
            "BUFF_NAME": "Healing"
        }
    },
    "buffs": []  # 用于存储当前施加的buff和它们的剩余回合数
}

dante = {
    "name": "Dante",
    "HP": 500,
    "MP": 150,
    "ATK": 700,
    "DEF": 60,
    "CC": 40,  # 暴击率
    "SPEED": 120,
    "CA": 50,  # 暴击伤害
    "PI": 40,  # 护甲穿透
    "EV": 40,  # 闪避率
    "AC": 50,  # 命中率
    "skill": {
        "s1": {
            "name": "Rebellion Slash",
            "description": "Dante用他的Rebellion大剑进行猛烈的挥砍，造成大范围伤害并降低敌人防御。",
            "DMG": 1000,
            "BUFF_HP": 0,
            "BUFF_DMG": 0,
            "BUFF_CC": 0,
            "BUFF_MP": 0,
            "BUFF_DEF": -20,
            "BUFF_EV": 0,
            "BUFF_AC": 0,
            "IS_STUN": False,
            "MP_COST": 50,
            "BUFF_TIME": 2,
            "BUFF_NAME": "Defense Reduction"
        },
        "s2": {
            "name": "Devil Trigger",
            "description": "Dante释放恶魔之力，进入Devil Trigger状态，提升攻击力和暴击率，同时每回合恢复部分魔法值。",
            "DMG": 0,
            "BUFF_HP": 0,
            "BUFF_DMG": 200,
            "BUFF_CC": 30,
            "BUFF_MP": 20,
            "BUFF_DEF": 0,
            "BUFF_EV": 0,
            "BUFF_AC": 0,
            "IS_STUN": False,
            "MP_COST": 100,
            "BUFF_TIME": 3,
            "BUFF_NAME": "Devil Trigger"
        }
    },
    "buffs": []  # 用于存储当前施加的buff和它们的剩余回合数
}

# 计算伤害函数
def calculate_damage(attacker, defender):
    # 命中率与闪避率互相抵消
    hit_chance = attacker["AC"] - defender["EV"]
    hit = random.randint(1, 100) <= hit_chance  # 计算是否命中
    if not hit:
        return 0, False  # 未命中，伤害为0

    # 计算伤害
    base_damage = attacker["ATK"] * (1 - defender["DEF"] / 100)  # 攻击力与防御力的计算
    critical_hit = random.randint(1, 100) <= attacker["CC"]  # 判断是否暴击
    if critical_hit:
        base_damage *= (1 + attacker["CA"] / 100)  # 暴击伤害加成
    # 计算穿透
    base_damage *= (1 - defender["PI"] / 100)
    return base_damage, critical_hit

# 更新buff持续回合数
def update_buffs(player):
    for buff in player["buffs"]:
        buff["turns_left"] -= 1  # 每回合减少buff的持续回合数
    player["buffs"] = [buff for buff in player["buffs"] if buff["turns_left"] > 0]  # 移除已过期的buff

# 攻击函数，包括技能和普通攻击
def battle_round_with_skills_and_mp(player1, player2, first_attacker):
    # 判断谁是第一回合的攻击者
    if first_attacker == 1:
        attacker, defender = player1, player2
    else:
        attacker, defender = player2, player1

    # 更新buff
    update_buffs(attacker)
    update_buffs(defender)

    # 判断是否有足够魔法使用技能
    if attacker["MP"] >= attacker["skill"]["s1"]["MP_COST"]:
        # 随机选择技能
        skills = ["s1", "s2"]
        skill_to_use = random.choice(skills)

        if skill_to_use == "s1" and attacker["MP"] >= attacker["skill"]["s1"]["MP_COST"]:
            skill = attacker["skill"]["s1"]
            damage, is_critical = calculate_damage(attacker, defender)
            if damage > 0:
                defender["HP"] -= damage
                # 应用Buff效果
                defender["HP"] += skill["BUFF_HP"]
                defender["ATK"] += skill["BUFF_DMG"]
                defender["DEF"] += skill["BUFF_DEF"]
                defender["EV"] += skill["BUFF_EV"]
                defender["AC"] += skill["BUFF_AC"]
                attacker["MP"] -= skill["MP_COST"]
                attacker["buffs"].append({"buff_name": skill["BUFF_NAME"], "turns_left": skill["BUFF_TIME"]})
                return f"{attacker['name']}使用了{skill['name']}，造成{damage:.2f}点{'暴击' if is_critical else ''}伤害。{defender['name']}剩余生命值：{defender['HP']:.2f}"

        elif skill_to_use == "s2" and attacker["MP"] >= attacker["skill"]["s2"]["MP_COST"]:
            skill = attacker["skill"]["s2"]
            attacker["MP"] -= skill["MP_COST"]
            # 应用Buff效果
            attacker["ATK"] += skill["BUFF_DMG"]
            attacker["CC"] += skill["BUFF_CC"]
            attacker["MP"] += skill["BUFF_MP"]
            attacker["EV"] += skill["BUFF_EV"]
            attacker["AC"] += skill["BUFF_AC"]
            attacker["buffs"].append({"buff_name": skill["BUFF_NAME"], "turns_left": skill["BUFF_TIME"]})
            return f"{attacker['name']}使用了{skill['name']}，提升了属性，{attacker['name']}的攻击力：{attacker['ATK']}，暴击率：{attacker['CC']}，魔法：{attacker['MP']}"

    # 如果魔法不够，普通攻击
    damage, is_critical = calculate_damage(attacker, defender)
    if damage > 0:
        defender["HP"] -= damage
        return f"{attacker['name']}普通攻击了{defender['name']}，造成{damage:.2f}点{'暴击' if is_critical else ''}伤害。{defender['name']}剩余生命值：{defender['HP']:.2f}"
    else:
        return f"{attacker['name']}普通攻击了{defender['name']}，但是未命中。{defender['name']}剩余生命值：{defender['HP']:.2f}"

# 模拟战斗函数
def simulate_battle(player1, player2, max_rounds=30):
    battle_log = []
    first_attacker = 1 if player1["SPEED"] >= player2["SPEED"] else 2  # 根据速度决定先攻
    round_num = 1

    while round_num <= max_rounds:
        # 判断战斗是否结束
        if player1["HP"] <= 0 or player2["HP"] <= 0:
            break

        round_result = battle_round_with_skills_and_mp(player1, player2, first_attacker)
        battle_log.append(round_result)

        # 交替攻击
        first_attacker = 2 if first_attacker == 1 else 1

        round_num += 1

    # 战斗结束后判断谁胜利
    if player1["HP"] > player2["HP"]:
        battle_log.append(f"{player1['name']}胜利，剩余生命值：{player1['HP']}")
    elif player2["HP"] > player1["HP"]:
        battle_log.append(f"{player2['name']}胜利，剩余生命值：{player2['HP']}")
    else:
        battle_log.append("平局")

    return battle_log

# 进行模拟战斗
battle_log_final_with_mp_and_normal_attack = simulate_battle(doom_slayer, dante, max_rounds=30)

# 输出最终战斗日志
print(battle_log_final_with_mp_and_normal_attack)

