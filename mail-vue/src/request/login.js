import http from '@/axios/index.js';

export function login(email, password) {
    return http.post('/login', {email: email, password: password})
}

export function logout() {
    return http.delete('/logout')
}

export function register(form) {
    return http.post('/register', form)
}

export function oauthSub2apiLogin(email, password) {
    return http.post('/oauth/sub2api/login', {email, password})
}