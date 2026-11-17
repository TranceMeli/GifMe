import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'items', component: () => import('@/views/ItemsView.vue') },
    { path: '/add', name: 'add', component: () => import('@/views/AddView.vue') },
    {
      path: '/items/:id(\\d+)',
      name: 'item',
      component: () => import('@/views/ItemDetailView.vue'),
      props: true,
    },
    {
      path: '/items/:id(\\d+)/edit',
      name: 'edit',
      component: () => import('@/views/ItemEditView.vue'),
      props: true,
    },
    { path: '/:pathMatch(.*)*', redirect: { name: 'items' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router
