import { createRouter, createWebHashHistory } from 'vue-router'
import RulebookRoot from './components/RulebookRoot.vue'

/**
 * Creates a Vue Router for the rulebook with hash history.
 * Use this in the plugin so the rulebook works without a visible URL.
 * Routes: / (index) and /:pathMatch(.*) (page path).
 */
export function createRulebookRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', name: 'rulebook', component: RulebookRoot },
      { path: '/:pathMatch(.*)', name: 'rulebook-page', component: RulebookRoot },
    ],
  })
}
