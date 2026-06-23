# frozen_string_literal: true

Rails.application.config.to_prepare do
  next if Decidim.content_blocks.for(:homepage).any? { |block| block.name == :global_menu }

  Decidim.content_blocks.register(:homepage, :global_menu) do |content_block|
    content_block.cell = "decidim/content_blocks/global_menu"
    content_block.public_name_key = "decidim.decidim_awesome.admin.config.form.home_content_block_menu.title"
  end
end# frozen_string_literal: true

Rails.application.config.to_prepare do
  next if Decidim.content_blocks.for(:homepage).any? { |block| block.name == :global_menu }

  Decidim.content_blocks.register(:homepage, :global_menu) do |content_block|
    content_block.cell = "decidim/content_blocks/global_menu"
    content_block.public_name_key = "decidim.content_blocks.global_menu.name"
  end
end
