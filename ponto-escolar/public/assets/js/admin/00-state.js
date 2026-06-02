/**
 * ============================================================
 * SISTEMA DE PONTO — SALA DO FUTURO
 * admin-main.js — Lógica da área administrativa
 * ============================================================
 */

'use strict';

/* ============================================================
   DADOS GLOBAIS (simulados — integrar com back-end)
   ============================================================ */
const togglePwButton = document.getElementById('toggle-pw');
if (togglePwButton) {
  togglePwButton.addEventListener('click', function() {
    const inp = document.getElementById('login-senha');
    if (!inp) {
      return;
    }
    const isHidden = inp.type === 'password';
    inp.type = isHidden ? 'text' : 'password';
    this.textContent = isHidden ? '🙈' : '👁';
  });
}
const ADMIN = {
  nome: 'Carlos Eduardo',
  cargo: 'Administrador',
};

let FUNCIONARIOS = [
  { id:1, nome:'Ana Beatriz Souza',    cargo:'Professora',      email:'ana@escola.edu.br',      cpf:'111.222.333-44', tel:'(11) 99001-0001', status:'ativo',   admissao:'15/03/2020' },
  { id:2, nome:'Bruno Lima',           cargo:'Coordenador',     email:'bruno@escola.edu.br',    cpf:'222.333.444-55', tel:'(11) 99001-0002', status:'ativo',   admissao:'08/07/2019' },
  { id:3, nome:'Carla Ferreira',       cargo:'Secretária',      email:'carla@escola.edu.br',    cpf:'333.444.555-66', tel:'(11) 99001-0003', status:'ativo',   admissao:'22/01/2021' },
  { id:4, nome:'Diego Moraes',         cargo:'Professor',       email:'diego@escola.edu.br',    cpf:'444.555.666-77', tel:'(11) 99001-0004', status:'ativo',   admissao:'10/02/2022' },
  { id:5, nome:'Elaine Rodrigues',     cargo:'Diretora',        email:'elaine@escola.edu.br',   cpf:'555.666.777-88', tel:'(11) 99001-0005', status:'ativo',   admissao:'05/09/2018' },
  { id:6, nome:'Fernando Costa',       cargo:'Inspetor',        email:'fernando@escola.edu.br', cpf:'666.777.888-99', tel:'(11) 99001-0006', status:'inativo', admissao:'30/11/2021' },
  { id:7, nome:'Gabriela Mendes',      cargo:'Professora',      email:'gabi@escola.edu.br',     cpf:'777.888.999-00', tel:'(11) 99001-0007', status:'ativo',   admissao:'17/04/2023' },
  { id:8, nome:'Henrique Alves',       cargo:'Auxiliar',        email:'henrique@escola.edu.br', cpf:'888.999.000-11', tel:'(11) 99001-0008', status:'ativo',   admissao:'01/06/2022' },
];

const PONTOS_HOJE = [
  { id:1, funcionarioId:1, entrada:'07:55', pausa:'12:00', retorno:'13:00', saida:'17:05', status:'completo' },
  { id:2, funcionarioId:2, entrada:'08:02', pausa:'12:05', retorno:'13:05', saida:null,    status:'presente' },
  { id:3, funcionarioId:4, entrada:'07:48', pausa:'12:00', retorno:'13:00', saida:'17:00', status:'completo' },
  { id:4, funcionarioId:5, entrada:'07:30', pausa:'11:58', retorno:'12:58', saida:'17:00', status:'completo' },
  { id:5, funcionarioId:7, entrada:'08:10', pausa:null,    retorno:null,    saida:null,    status:'presente' },
];

