"""
가격 포맷팅 유틸리티
"""

def get_price_text(property):
    """매물 가격 텍스트 생성"""
    maemae = property.get("maemae_money", 0)
    jeonse = property.get("jen_money", 0)
    deposit = property.get("security_money", 0)
    monthly = property.get("month_money", 0)

    if maemae and maemae > 0:
        return f"매매 {format_number(maemae)}만원"
    elif jeonse and jeonse > 0:
        return f"전세 {format_number(jeonse)}만원"
    elif (deposit and deposit > 0) or (monthly and monthly > 0):
        deposit_text = f"{format_number(deposit)}" if deposit > 0 else ""
        monthly_text = f"{format_number(monthly)}" if monthly > 0 else ""
        return f"월세 {deposit_text}/{monthly_text}".strip()
    else:
        return ""

def format_number(value):
    """숫자 포맷팅 (천 단위 콤마)"""
    return f"{int(value):,}"

def get_card_price(prop):
    """카드 미리보기용 가격 텍스트 (억 단위 표현, JS formatPrice와 동일한 형식)"""
    def fmt(n):
        if not n or n <= 0:
            return ''
        eok = n // 10000        # 억 단위
        man = n % 10000         # 만 단위
        s = ''
        if eok > 0:
            s += f'{eok}억'
        if man > 0:
            s += (' ' if eok > 0 else '') + f'{man:,}만'
        return s or str(n)

    maemae  = prop.get('maemae_money',  0) or 0
    jeonse  = prop.get('jen_money',     0) or 0
    deposit = prop.get('security_money', 0) or 0
    monthly = prop.get('month_money',   0) or 0

    if maemae > 0:
        return '매매 ' + fmt(maemae)
    if jeonse > 0:
        return '전세 ' + fmt(jeonse)
    if deposit > 0 or monthly > 0:
        d = fmt(deposit) if deposit > 0 else '0'
        m = fmt(monthly) if monthly > 0 else '0'
        return f'월세 {d}/{m}'  # fmt()가 이미 '만' 포함하므로 접미사 없음
    return ''