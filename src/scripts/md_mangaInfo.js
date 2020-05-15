(function () {
  try {
    const url = location.href
    if (!url.match(/^https:\/\/mangadex\.org\/title\//)) {
      return false
    }
    const manga_id = parseInt(url.replace(/^https:\/\/mangadex\.org\/title\//, '').match(/^(\d+)/)[0])
    const title = document.querySelector('#content div.card .card-header span.mx-1').innerText
    const image = document.querySelector('img.rounded').attributes.src.value
    return {
      manga_id,
      title,
      image,
      url
    }
  } catch (e) {
  }
  return false
})()
