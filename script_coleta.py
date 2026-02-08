import requests
import json
import os

# Configurações
API_KEY = os.environ["API_TOKEN"] # Vamos configurar isso no GitHub Secrets
URL = "https://api.football-data.org/v4/competitions/PL/matches" # PL = Premier League
# Outras ligas: BSA (Brasileirão), PD (La Liga), SA (Serie A)

headers = {"X-Auth-Token": API_KEY}

def buscar_dados():
    # Filtra apenas jogos "FINISHED" (Finalizados) ou "LIVE"
    params = {"status": "FINISHED"} 
    
    try:
        response = requests.get(URL, headers=headers, params=params)
        response.raise_for_status()
        dados = response.json()
        
        # Vamos salvar apenas o necessário para o arquivo ficar leve
        jogos_limpos = []
        for match in dados.get('matches', [])[-10:]: # Pega os últimos 10 jogos
            jogos_limpos.append({
                "data": match['utcDate'],
                "time_casa": match['homeTeam']['name'],
                "time_fora": match['awayTeam']['name'],
                "placar_casa": match['score']['fullTime']['home'],
                "placar_fora": match['score']['fullTime']['away'],
                "brasao_casa": match['homeTeam']['crest'],
                "brasao_fora": match['awayTeam']['crest']
            })

        # Salva no arquivo que o site vai ler
        with open("resultados.json", "w", encoding="utf-8") as f:
            json.dump(jogos_limpos, f, indent=4)
            
        print("Dados atualizados com sucesso!")
        
    except Exception as e:
        print(f"Erro ao buscar dados: {e}")

if __name__ == "__main__":
    buscar_dados()
