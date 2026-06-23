# frozen_string_literal: true

Decidim::DecidimAwesome.configure do |config|
  config.enabled = [
    :home_content_block_menu,
    :scoped_styles,
    :awesome_map,
    :menu_hacks,
    :custom_redirects,
    :proposal_custom_fields,
    :admins
  ]
end
