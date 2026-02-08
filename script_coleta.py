import requests
import json
import os
from datetime import datetime, timedelta

# --- Configurações ---
API_KEY = os.environ["API_TOKEN"]

# Códigos das Ligas: 
# BSA (Brasileirão Série A), PL (Premier League), PD (La Liga), 
# CL (Champions League), SA (Serie A Italia), FL1 (Ligue 1), BL1 (Bundesliga)
LIGAS = "BSA,PL,PD,CL,SA,BL1" 

headers = {"X-Auth-Token": API_KEY}

def limpar_jogo(match):
    """Extrai apenas os dados essenciais para o JSON ficar leve"""
    return {
        "id": match['id'],
        "data": match['utcDate'],
        "status": match['status'],
        "liga": match['competition']['name'],
        "bandeira_liga": match['competition']['emblem'],
        "time_casa": match['homeTeam']['shortName'] or match['homeTeam']['name'],
        "time_fora": match['awayTeam']['shortName'] or match['awayTeam']['name'],
        "placar_casa": match['score']['fullTime']['home'],
        "placar_fora": match['score']['fullTime']['away'],
        "brasao_casa": match['homeTeam']['crest'],
        "brasao_fora": match['awayTeam']['crest']
    }

def buscar_dados():
    hoje = datetime.now().date()
    ontem = hoje - timedelta(days=1)
    semana_que_vem = hoje + timedelta(days=7)

    # URL base para buscar várias ligas ao mesmo tempo
    url_base = "https://api.football-data.org/v4/matches"

    dados_finais = {
        "resultados": [],
        "proximos": []
    }

    try:
        # 1. Buscar Resultados Recentes (Ontem e Hoje)
        params_res = {
            "competitions": LIGAS,
            "dateFrom": ontem.strftime('%Y-%m-%d'),
            "dateTo": hoje.strftime('%Y-%m-%d'),
            "status": "FINISHED"
        }
        resp_res = requests.get(url_base, headers=headers, params=params_res)
        if resp_res.status_code == 200:
            matches = resp_res.json().get('matches', [])
            dados_finais["resultados"] = [limpar_jogo(m) for m in matches]

        # 2. Buscar Próximos Jogos (Hoje até +7 dias)
        params_prox = {
            "competitions": LIGAS,
            "dateFrom": hoje.strftime('%Y-%m-%d'),
            "dateTo": semana_que_vem.strftime('%Y-%m-%d'),
            "status": "SCHEDULED"
        }
        resp_prox = requests.get(url_base, headers=headers, params=params_prox)
        if resp_prox.status_code == 200:
            matches = resp_prox.json().get('matches', [])
            # Ordenar por data
            matches.sort(key=lambda x: x['utcDate'])
            dados_finais["proximos"] = [limpar_jogo(m) for m in matches]

        # Salvar JSON unificado
        with open("dados_futebol.json", "w", encoding="utf-8") as f:
            json.dump(dados_finais, f, indent=4)
            
        print(f"Sucesso! {len(dados_finais['resultados'])} resultados e {len(dados_finais['proximos'])} próximos jogos.")

    except Exception as e:
        print(f"Erro Crítico: {e}")

if __name__ == "__main__":
    buscar_dados()
