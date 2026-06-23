Decidim.configure do |config|
  config.maps = {
    provider: :here,
    api_key: ENV["MAPS_API_KEY"],
    geocoding: {
      host: "geocode.search.hereapi.com",
      use_https: true
    }
  }
end
