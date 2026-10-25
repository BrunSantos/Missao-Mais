MISSÃO+ V3 — SUBSTITUIÇÃO COMPLETA

1. Descompacta este ZIP.
2. No GitHub Desktop: Repository > Show in Finder.
3. Abre a pasta MissaoMais do ZIP e copia TODOS os ficheiros de dentro para a raiz do repositório, substituindo os existentes.
   Não coloques a pasta MissaoMais dentro de outra pasta MissaoMais.
4. Apaga da raiz o ficheiro antigo firebase-config.js, se ainda existir.
5. No GitHub Desktop: Commit to main > Push origin.
6. Confirma em GitHub > Actions que o deploy Pages terminou.
7. Abre o endereço do GitHub Pages em janela privada. Deverá aparecer 'Versão 3'.
8. Testa o login com a conta já criada no Firebase Authentication. Não carregues em Criar conta.

O erro anterior mostrava pedidos com key=SUBSTITUIR: o navegador estava a carregar configuração antiga. Esta versão muda o nome do módulo de configuração para evitar essa colisão e atualiza os caminhos com ?v=3.

AVISO: Versão inicial para testar o login e a gestão do administrador. As tarefas, aprovações e recompensas continuam desativadas até existir segurança de backend. As regras firestore.rules permitem apenas o UID do administrador; NÃO as alargues para todos os utilizadores.
