import http from '@/axios/index.js';

export function giteaMatch() {
    return http.get('/gitea/match')
}

export function giteaAssign(giteaUsername, domain) {
    return http.post('/gitea/assign', {giteaUsername, domain})
}

export function giteaAssignAll(domain) {
    return http.post('/gitea/assignAll', {domain})
}

export function giteaCreate(fullName, domain) {
    return http.post('/gitea/create', {fullName, domain})
}

export function giteaPool() {
    return http.get('/gitea/pool')
}
