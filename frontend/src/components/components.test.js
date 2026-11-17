import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { makeItem, makeRouter } from '@/test/helpers'
import AppIcon from './AppIcon.vue'
import ItemTile from './ItemTile.vue'
import PageCrumbs from './PageCrumbs.vue'
import StatusMessage from './StatusMessage.vue'

async function mountWithRouter(component, props) {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  return mount(component, { props, global: { plugins: [router] } })
}

describe('AppIcon', () => {
  it('is decorative and sized by the prop', () => {
    const wrapper = mount(AppIcon, { props: { name: 'plus', size: 30 } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('width')).toBe('30')
    expect(wrapper.find('path').attributes('d')).toBeTruthy()
  })

  it('draws the filled star and play icons with their own shapes', () => {
    expect(mount(AppIcon, { props: { name: 'star' } }).find('path').attributes('fill')).toBe('currentColor')
    expect(mount(AppIcon, { props: { name: 'play' } }).find('circle').exists()).toBe(true)
  })

  it('has a path for every icon the views use', () => {
    for (const name of ['plus', 'search', 'back', 'copy', 'link', 'trash', 'close', 'upload', 'edit', 'image', 'download', 'check', 'warn', 'info', 'chevron', 'reset', 'sort']) {
      expect(mount(AppIcon, { props: { name } }).find('path').attributes('d'), name).toBeTruthy()
    }
  })
})

describe('StatusMessage', () => {
  it('stays in the layout but is empty without text', () => {
    const wrapper = mount(StatusMessage)
    expect(wrapper.text()).toBe('')
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.attributes('aria-live')).toBe('polite')
  })

  it('shows a success message with a check icon', () => {
    const wrapper = mount(StatusMessage, { props: { text: 'Saved.' } })
    expect(wrapper.text()).toBe('Saved.')
    expect(wrapper.find('path').attributes('d')).toBe('M5 13l4 4L19 7')
    expect(wrapper.classes()).not.toContain('message--error')
  })

  it('marks errors with the word, a warning icon and an alert role', () => {
    const wrapper = mount(StatusMessage, { props: { text: 'It failed.', error: true } })
    expect(wrapper.text()).toBe('Error: It failed.')
    expect(wrapper.attributes('role')).toBe('alert')
    expect(wrapper.classes()).toContain('message--error')
    expect(wrapper.find('path').attributes('d')).toContain('M12 3l10 18')
  })

  it('shows hints with an info icon and no error prefix', () => {
    const wrapper = mount(StatusMessage, { props: { text: 'Nothing changed yet.', info: true } })
    expect(wrapper.text()).toBe('Nothing changed yet.')
    expect(wrapper.attributes('role')).toBe('status')
  })
})

describe('PageCrumbs', () => {
  it('links every step except the last, which is the current page', async () => {
    const wrapper = await mountWithRouter(PageCrumbs, {
      items: [
        { label: 'Collection', to: { name: 'items' } },
        { label: 'GIFs', to: { name: 'items', query: { type: 'gif' } } },
        { label: 'Funny cat' },
      ],
    })
    const links = wrapper.findAll('a')
    expect(links.map((a) => a.text())).toEqual(['Collection', 'GIFs'])
    expect(links[1].attributes('href')).toBe('/?type=gif')
    const current = wrapper.find('span.crumbs__current')
    expect(current.text()).toBe('Funny cat')
    expect(current.attributes('aria-current')).toBe('page')
    expect(wrapper.find('nav').attributes('aria-label')).toBe('Breadcrumb')
  })

  it('shows the back arrow only on the first link', async () => {
    const wrapper = await mountWithRouter(PageCrumbs, {
      items: [{ label: 'A', to: { name: 'items' } }, { label: 'B', to: { name: 'add' } }, { label: 'C' }],
    })
    const links = wrapper.findAll('a')
    expect(links[0].find('svg').exists()).toBe(true)
    expect(links[1].find('svg').exists()).toBe(false)
  })
})

describe('ItemTile', () => {
  it('shows the type badge, caption and a link to the detail page', async () => {
    const wrapper = await mountWithRouter(ItemTile, { item: makeItem({ id: 7, title: 'Funny cat', type: 'meme' }) })
    expect(wrapper.find('.tile__badge').text()).toBe('MEME')
    expect(wrapper.find('.caption').text()).toBe('Funny cat')
    expect(wrapper.find('.caption').classes()).not.toContain('caption--empty')
    expect(wrapper.find('a.tile__link').attributes('href')).toBe('/items/7')
    expect(wrapper.find('.sr-only').text()).toBe('Meme: Funny cat')
  })

  it('calls items without a title "Untitled" and names them after their first tag for screen readers', async () => {
    const wrapper = await mountWithRouter(ItemTile, { item: makeItem({ title: '', tags: ['owl'] }) })
    expect(wrapper.find('.caption').text()).toBe('Untitled')
    expect(wrapper.find('.caption').classes()).toContain('caption--empty')
    expect(wrapper.find('.sr-only').text()).toBe('GIF: owl')
  })

  it('shows a star only for favorites', async () => {
    const plain = await mountWithRouter(ItemTile, { item: makeItem() })
    const fav = await mountWithRouter(ItemTile, { item: makeItem({ is_favorite: true }) })
    expect(plain.find('.tile__star').exists()).toBe(false)
    expect(fav.find('.tile__star').attributes('aria-label')).toBe('Favorite')
  })

  it('offers the first tag as a filter button and reports clicks', async () => {
    const wrapper = await mountWithRouter(ItemTile, { item: makeItem({ tags: ['owl', 'bird'] }) })
    const button = wrapper.find('button.tile__tag')
    expect(button.text()).toBe('#owl')
    expect(button.attributes('title')).toBe('Filter by #owl')
    await button.trigger('click')
    expect(wrapper.emitted('tag')).toEqual([['owl']])
  })

  it('has no tag button without tags', async () => {
    const wrapper = await mountWithRouter(ItemTile, { item: makeItem({ tags: [] }) })
    expect(wrapper.find('button.tile__tag').exists()).toBe(false)
  })

  it('shows the still thumbnail of a gif until hovered or focused', async () => {
    const wrapper = await mountWithRouter(ItemTile, { item: makeItem() })
    expect(wrapper.find('img').attributes('src')).toBe('/media/thumbs/1.jpg')
    await wrapper.find('article').trigger('mouseenter')
    expect(wrapper.find('img').attributes('src')).toBe('/media/items/aa/1.gif')
    await wrapper.find('article').trigger('mouseleave')
    expect(wrapper.find('img').attributes('src')).toBe('/media/thumbs/1.jpg')
    await wrapper.find('article').trigger('focusin')
    expect(wrapper.find('img').attributes('src')).toBe('/media/items/aa/1.gif')
    await wrapper.find('article').trigger('focusout')
    expect(wrapper.find('img').attributes('src')).toBe('/media/thumbs/1.jpg')
  })

  it('animates a gif at once when autoplay is on', async () => {
    const wrapper = await mountWithRouter(ItemTile, { item: makeItem(), autoplay: true })
    expect(wrapper.find('img').attributes('src')).toBe('/media/items/aa/1.gif')
  })

  it('never swaps the picture of a meme', async () => {
    const wrapper = await mountWithRouter(ItemTile, { item: makeItem({ type: 'meme', file_url: '/media/items/aa/1.png' }), autoplay: true })
    expect(wrapper.find('img').attributes('src')).toBe('/media/thumbs/1.jpg')
  })

  it('plays a muted looping video on hover and shows the poster otherwise', async () => {
    const wrapper = await mountWithRouter(ItemTile, { item: makeItem({ type: 'video', file_url: '/media/items/aa/1.mp4' }) })
    expect(wrapper.find('video').exists()).toBe(false)
    await wrapper.find('article').trigger('mouseenter')
    const video = wrapper.find('video')
    expect(video.exists()).toBe(true)
    expect(video.attributes('src')).toBe('/media/items/aa/1.mp4')
    expect(video.attributes('poster')).toBe('/media/thumbs/1.jpg')
    expect(video.element.muted).toBe(true)
    expect(video.attributes('loop')).toBeDefined()
  })

  it('shows an icon when there is no thumbnail', async () => {
    const wrapper = await mountWithRouter(ItemTile, { item: makeItem({ thumbnail_url: null, type: 'meme' }) })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.tile__placeholder').exists()).toBe(true)
  })

  it('gives each tile one of four background shades by id', async () => {
    for (const [id, shade] of [[1, 'tile--shade-1'], [2, 'tile--shade-2'], [3, 'tile--shade-3'], [4, 'tile--shade-0']]) {
      const wrapper = await mountWithRouter(ItemTile, { item: makeItem({ id }) })
      expect(wrapper.find('article').classes()).toContain(shade)
    }
  })
})
