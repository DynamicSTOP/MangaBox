(function () {
  try {
    const url = location.href
    if (!url.match(/^https:\/\/mangadex\.org\/title\//)) {
      return false
    }
    const langs = {
      en: 1,
      ru: 7
    }

    const manga_site_id = parseInt(url.replace(/^https:\/\/mangadex\.org\/title\//, '').match(/^(\d+)/)[0])
    const title = document.querySelector('#content div.card .card-header span.mx-1').innerText
    const image = document.querySelector('img.rounded').attributes.src.value

    let last_ru = -1
    let last_en = -1
    let last = -1
    let last_ru_link, last_en_link, last_link

    document.querySelectorAll('.chapter-row').forEach((row) => {
      if (typeof row.dataset.id === 'undefined') return
      const timestamp = row.dataset.timestamp * 1000

      if (parseInt(row.dataset.lang) === langs.en) {
        if (last_en < timestamp) {
          last_en = timestamp
          last_en_link = row.querySelector('a').attributes.href.value
        }
      } else if (parseInt(row.dataset.lang) === langs.ru) {
        if (last_ru < timestamp) {
          last_ru = timestamp
          last_ru_link = row.querySelector('a').attributes.href.value
        }
      } else if (last < timestamp) {
        last = timestamp
        last_link = row.querySelector('a').attributes.href.value
      }
    })
    const info = {
      manga_site_id,
      site_id: 0,
      title,
      url,
      last_check: new Date().getTime(),
      json: {
        image,
        last_ru_link,
        last_en_link,
        last_link
      }
    }
    if (last > 0) info.last = last
    if (last_ru > 0) info.last_ru = last_ru
    if (last_en > 0) info.last_en = last_en

    return info
  } catch (e) {
  }
  return false
})()

