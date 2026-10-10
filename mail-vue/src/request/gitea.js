import http from '@/axios/index.js';

export function giteaMatch() {
    return http.get('/gitea/match')
}

export function giteaAssign(giteaUsername) {
    return http.post('/gitea/assign', {giteaUsername})
}

export function giteaCreate(fullName) {
    return http.post('/gitea/create', {fullName})
}

export function giteaPool() {
    return http.get('/gitea/pool')
}
