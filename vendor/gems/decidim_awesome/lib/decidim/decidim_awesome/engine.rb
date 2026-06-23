# frozen_string_literal: true

require "rails"
require "deface"
require "decidim/core"
require "decidim/decidim_awesome/awesome_helpers"
require "decidim/decidim_awesome/menu"
require "decidim/decidim_awesome/middleware/current_config"
require "active_hashcash" if Decidim::DecidimAwesome.enabled?(:hashcash_signup, :hashcash_login)

module Decidim
  module DecidimAwesome
    # This is the engine that runs on the public interface of decidim_awesome.
    class Engine < ::Rails::Engine
      include AwesomeHelpers

      isolate_namespace Decidim::DecidimAwesome

      def self.safe_include(target_name, mod_name)
        target = target_name.to_s.safe_constantize
        mod = mod_name.to_s.safe_constantize

        return unless target && mod

        target.include(mod) unless target < mod
      rescue NameError
        nil
      end

      routes do
        get :required_authorizations, to: "required_authorizations#index"
        post :editor_images, to: "editor_images#create"
        get "form_builder_i18n(/:lang)", to: "utils#form_builder_i18n", as: :form_builder_i18n
      end

      # Prepare a zone to create overrides
      # https://edgeguides.rubyonrails.org/engines.html#overriding-models-and-controllers
      # overrides
      config.to_prepare do
        if DecidimAwesome.enabled?(:force_authorizations)
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::LastActivity", "Decidim::DecidimAwesome::LastActivityOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::OpenDataExporter", "Decidim::DecidimAwesome::OpenDataExporterOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Core::ParticipatorySpaceListBase", "Decidim::DecidimAwesome::ParticipatorySpaceListBaseOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Core::ComponentList", "Decidim::DecidimAwesome::ComponentListOverride")
        end

        if DecidimAwesome.enabled?(:hashcash_signup, :hashcash_login)
          # Add hashcash to signup and login
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Devise::SessionsController", "Decidim::DecidimAwesome::NeedsHashcash")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Devise::RegistrationsController", "Decidim::DecidimAwesome::NeedsHashcash")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::ApplicationController", "Decidim::DecidimAwesome::NeedsHashcash")
        end

        # Include additional helpers globally
        ActiveSupport.on_load(:action_view) { include Decidim::DecidimAwesome::AwesomeHelpers }

        # Also for cells
        Decidim::DecidimAwesome::Engine.safe_include("Decidim::ViewModel", "Decidim::DecidimAwesome::AwesomeHelpers")

        # Override EtiquetteValidator
        if DecidimAwesome.enabled?(:validate_title_max_caps_percent,
                                   :validate_title_max_marks_together,
                                   :validate_title_start_with_caps,
                                   :validate_body_max_caps_percent,
                                   :validate_body_max_marks_together,
                                   :validate_body_start_with_caps)
          Decidim::DecidimAwesome::Engine.safe_include("EtiquetteValidator", "Decidim::DecidimAwesome::EtiquetteValidatorOverride")
        end

        # Custom fields need to deal with several places
        if DecidimAwesome.enabled?(:proposal_custom_fields,
                                   :proposal_private_custom_fields,
                                   :validate_title_min_length,
                                   :validate_title_max_caps_percent,
                                   :validate_title_max_marks_together,
                                   :validate_title_start_with_caps,
                                   :validate_body_min_length,
                                   :validate_body_max_caps_percent,
                                   :validate_body_max_marks_together,
                                   :validate_body_start_with_caps)
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::ProposalForm", "Decidim::DecidimAwesome::Proposals::ProposalFormCustomizations")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::Admin::ProposalForm", "Decidim::DecidimAwesome::Proposals::Admin::ProposalFormCustomizations")
        end

        if DecidimAwesome.enabled?(:proposal_custom_fields, :proposal_private_custom_fields)
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::ProposalForm", "Decidim::DecidimAwesome::Proposals::ProposalFormOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::Admin::ProposalForm", "Decidim::DecidimAwesome::Proposals::ProposalFormOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::ProposalPresenter", "Decidim::DecidimAwesome::Proposals::ProposalPresenterOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::CreateProposal", "Decidim::DecidimAwesome::Proposals::CreateProposalOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::CreateCollaborativeDraft", "Decidim::DecidimAwesome::Proposals::CreateCollaborativeDraftOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::Admin::CreateProposal", "Decidim::DecidimAwesome::Proposals::CreateProposalOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::UpdateProposal", "Decidim::DecidimAwesome::Proposals::UpdateProposalOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::UpdateCollaborativeDraft", "Decidim::DecidimAwesome::Proposals::UpdateCollaborativeDraftOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::Admin::UpdateProposal", "Decidim::DecidimAwesome::Proposals::Admin::UpdateProposalOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::ProposalType", "Decidim::DecidimAwesome::AddProposalTypeCustomFields")
        end

        if DecidimAwesome.enabled?(:admins_available_authorizations)
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::System::RegisterOrganizationForm", "Decidim::DecidimAwesome::System::OrganizationFormOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::System::UpdateOrganizationForm", "Decidim::DecidimAwesome::System::OrganizationFormOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::System::UpdateOrganization", "Decidim::DecidimAwesome::System::UpdateOrganizationOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::System::CreateOrganization", "Decidim::DecidimAwesome::System::CreateOrganizationOverride")
        end

        if DecidimAwesome.enabled?(:proposal_custom_fields, :proposal_private_custom_fields, :weighted_proposal_voting)
          # add vote weight/private_body to proposals
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::Proposal", "Decidim::DecidimAwesome::HasProposalExtraFields")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::CollaborativeDraft", "Decidim::DecidimAwesome::HasProposalExtraFields")
        end

        if Decidim::DecidimAwesome.enabled?(:user_timezone)
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::AccountForm", "Decidim::DecidimAwesome::AccountFormOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::UpdateAccount", "Decidim::DecidimAwesome::UpdateAccountOverride")
        end

        if DecidimAwesome.enabled?(:weighted_proposal_voting)
          # add vote weight to proposal vote
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::ProposalVote", "Decidim::DecidimAwesome::HasVoteWeight")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::ProposalType", "Decidim::DecidimAwesome::AddProposalTypeVoteWeights")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::ProposalLCell", "Decidim::DecidimAwesome::ProposalLCellOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::ProposalGCell", "Decidim::DecidimAwesome::ProposalGCellOverride")
        end

        # override user's admin property
        Decidim::DecidimAwesome::Engine.safe_include("Decidim::User", "Decidim::DecidimAwesome::UserOverride") if DecidimAwesome.enabled?(:scoped_admins)

        if DecidimAwesome.enabled?(:menu, :mobile_menu, :home_content_block_menu)
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::ContentBlocks::GlobalMenuCell", "Decidim::DecidimAwesome::GlobalMenuCellOverride") if DecidimAwesome.enabled?(:home_content_block_menu)
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::BreadcrumbHelper", "Decidim::DecidimAwesome::BreadcrumbHelperOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::MenuPresenter", "Decidim::DecidimAwesome::MenuPresenterOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::MenuItemPresenter", "Decidim::DecidimAwesome::MenuItemPresenterOverride")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::BreadcrumbRootMenuItemPresenter", "Decidim::DecidimAwesome::BreadcrumbRootMenuItemPresenterOverride")
        end

        # Late registering of components to take into account initializer values
        DecidimAwesome.registered_components.each do |manifest, block|
          next if DecidimAwesome.disabled_components&.include?(manifest)
          next if Decidim.find_component_manifest(manifest)

          Decidim.register_component(manifest, &block)
        end
      end

      initializer "decidim_decidim_awesome.overrides", after: "decidim.action_controller" do
        config.to_prepare do
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::ApplicationController", "Decidim::DecidimAwesome::EnforceAccessAuthorizations") if DecidimAwesome.enabled?(:force_authorizations)
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::ApplicationController", "Decidim::DecidimAwesome::UseUserTimeZone") if Decidim::DecidimAwesome.enabled?(:user_timezone)

          # Auto-insert some csp directives
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::ApplicationController", "Decidim::DecidimAwesome::ContentSecurityPolicy")
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Admin::ApplicationController", "Decidim::DecidimAwesome::ContentSecurityPolicy")

          # redirect unauthorized scoped admins to allowed places or custom redirects if configured
          Decidim::DecidimAwesome::Engine.safe_include("Decidim::ErrorsController", "Decidim::DecidimAwesome::NotFoundRedirect") if DecidimAwesome.enabled?(:scoped_admins, :custom_redirects)

          # Custom fields need to deal with several places
          if DecidimAwesome.enabled?(:proposal_custom_fields, :proposal_private_custom_fields)
            Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::ApplicationHelper", "Decidim::DecidimAwesome::Proposals::ApplicationHelperOverride")
            Decidim::DecidimAwesome::Engine.safe_include("Decidim::AmendmentsHelper", "Decidim::DecidimAwesome::AmendmentsHelperOverride")
          end

          if DecidimAwesome.enabled?(:proposal_custom_fields, :proposal_private_custom_fields, :weighted_proposal_voting)
            Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::ProposalSerializer", "Decidim::DecidimAwesome::Proposals::ProposalSerializerOverride")
            Decidim::DecidimAwesome::Engine.safe_include("Decidim::AdminLog::ComponentPresenter", "Decidim::DecidimAwesome::AdminLog::ComponentPresenterOverride")
          end

          if DecidimAwesome.enabled?(:weighted_proposal_voting)
            Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::ProposalsController", "Decidim::DecidimAwesome::Proposals::MemoizeExtraFields")
            Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::ProposalVotesController", "Decidim::DecidimAwesome::Proposals::ProposalVotesControllerOverride")
          end

          Decidim::DecidimAwesome::Engine.safe_include("Decidim::AdminLog::UserPresenter", "Decidim::DecidimAwesome::AdminLog::UserPresenterOverride") if DecidimAwesome.enabled?(:admins_available_authorizations)

          Decidim::DecidimAwesome::Engine.safe_include("Decidim::AmendmentsController", "Decidim::DecidimAwesome::LimitPendingAmendments") if DecidimAwesome.enabled?(:allow_limiting_amendments)

          Decidim::DecidimAwesome::Engine.safe_include("Decidim::Proposals::ProposalsController", "Decidim::DecidimAwesome::Proposals::OrderableOverride") if DecidimAwesome.enabled?(:additional_proposal_sortings)
        end
      end

      initializer "decidim_decidim_awesome.middleware", after: "decidim_core.middleware" do |app|
        app.config.middleware.insert_after Decidim::Middleware::CurrentOrganization, Decidim::DecidimAwesome::CurrentConfig
      end

      initializer "decidim_decidim_awesome.additional_proposal_options" do |_app|
        component = Decidim.component_registry.find(:proposals) rescue nil

        if component
          component.settings(:global) do |settings|
            if DecidimAwesome.enabled?(:additional_proposal_sortings)
              settings.attribute(
                :default_sort_order,
                type: :select,
                default: "default",
                choices: ->(_context) { (POSSIBLE_SORT_ORDERS + DecidimAwesome.possible_additional_proposal_sortings).uniq }
              )
            end

            if DecidimAwesome.enabled?(:allow_limiting_amendments)
              DecidimAwesome.hash_append!(
                settings.attributes,
                :amendments_enabled,
                :limit_pending_amendments,
                Decidim::SettingsManifest::Attribute.new(type: :boolean, default: DecidimAwesome.allow_limiting_amendments)
              )
            end
          end

          if DecidimAwesome.enabled?(:additional_proposal_sortings)
            component.settings(:step) do |settings|
              settings.attribute(
                :default_sort_order,
                type: :select,
                include_blank: true,
                choices: ->(_context) { (POSSIBLE_SORT_ORDERS + DecidimAwesome.possible_additional_proposal_sortings).uniq }
              )
            end
          end

          if DecidimAwesome.enabled?(:proposal_private_custom_fields)
            # Add to the "proposals" component an exporter that is not
            # included in open-data to be able to export all private fields
            # from the administration without exposing data to the frontend.
            component.exports :awesome_private_proposals do |exports|
              exports.collection do |component_instance, user|
                space = component_instance.participatory_space

                collection = Decidim::Proposals::Proposal
                             .published
                             .not_hidden
                             .where(component: component_instance)
                             .includes(:scope, :category, :component)

                if space.user_roles(:evaluator).where(user:).any?
                  collection.with_evaluation_assigned_to(user, space)
                else
                  collection
                end
              end

              exports.include_in_open_data = false
              exports.serializer Decidim::DecidimAwesome::Proposals::PrivateProposalSerializer
            end
          end
        end
      end

      initializer "decidim_decidim_awesome.weighted_proposal_voting" do |_app|
        if DecidimAwesome.enabled?(:weighted_proposal_voting)
          # register available processors
          Decidim::DecidimAwesome.voting_registry.register(:voting_cards) do |voting|
            voting.show_vote_button_view = "decidim/decidim_awesome/voting/voting_cards/show_vote_button"
            # voting.show_votes_count_view = "decidim/decidim_awesome/voting/voting_cards/show_votes_count"
            voting.show_votes_count_view = "" # hide votes count if not needed (in this case is integrated in the show_vote_button_view)
            voting.proposal_vote_cell = "decidim/decidim_awesome/voting/voting_cards_proposal_vote"
            voting.weight_validator do |weight, context|
              allowed = [1, 2, 3]
              # rubocop:disable Style/SafeNavigationChainLength
              allowed << 0 if context[:proposal]&.component&.settings&.voting_cards_show_abstain
              # rubocop:enable Style/SafeNavigationChainLength
              weight.in? allowed
            end
          end

          Decidim::DecidimAwesome.voting_components&.each do |manifest|
            component = Decidim.component_registry.find(manifest) rescue nil
            next unless component

            component.settings(:global) do |settings|
              DecidimAwesome.hash_append!(
                settings.attributes,
                :can_accumulate_votes_beyond_threshold,
                :awesome_voting_manifest,
                Decidim::SettingsManifest::Attribute.new(
                  type: :select,
                  default: "",
                  choices: ->(_context) { ["default"] + Decidim::DecidimAwesome.voting_registry.manifests.map(&:name) },
                  readonly: lambda { |context|
                    Decidim::Proposals::Proposal.where(component: context[:component]).where.not(proposal_votes_count: -Float::INFINITY..0).any?
                  }
                )
              )
              DecidimAwesome.hash_append!(
                settings.attributes,
                :awesome_voting_manifest,
                :voting_cards_box_title,
                Decidim::SettingsManifest::Attribute.new(type: :string, translated: true)
              )
              DecidimAwesome.hash_append!(
                settings.attributes,
                :voting_cards_box_title,
                :voting_cards_show_modal_help,
                Decidim::SettingsManifest::Attribute.new(type: :boolean, default: true)
              )
              DecidimAwesome.hash_append!(
                settings.attributes,
                :voting_cards_show_modal_help,
                :voting_cards_show_abstain,
                Decidim::SettingsManifest::Attribute.new(type: :boolean, default: false)
              )
              DecidimAwesome.hash_append!(
                settings.attributes,
                :voting_cards_show_abstain,
                :voting_cards_instructions,
                Decidim::SettingsManifest::Attribute.new(type: :text, translated: true, editor: true)
              )
            end
          end
        end
      end

      initializer "decidim_decidim_awesome.webpacker.assets_path" do
        Decidim.register_assets_path File.expand_path("app/packs", root)
      end

      # Votings may override proposals cells, let's be sure to add these paths after the proposal component initializer
      initializer "decidim_decidim_awesome.add_cells_view_paths", before: "decidim_proposals.add_cells_view_paths" do
        Cell::ViewModel.view_paths << File.expand_path("#{Decidim::DecidimAwesome::Engine.root}/app/cells")
        Cell::ViewModel.view_paths << File.expand_path("#{Decidim::DecidimAwesome::Engine.root}/app/views")
      end

      initializer "decidim_decidim_awesome.register_icons" do
        Decidim.icons.register(name: "editors-text", icon: "text", category: "system", description: "", engine: :decidim_awesome)
        Decidim.icons.register(name: "surveys", icon: "survey-line", category: "system", description: "", engine: :decidim_awesome)
        Decidim.icons.register(name: "brush", icon: "brush-line", category: "system", description: "", engine: :decidim_awesome)
        Decidim.icons.register(name: "layers", icon: "stack-line", category: "system", description: "", engine: :decidim_awesome)
        Decidim.icons.register(name: "pulse", icon: "pulse-line", category: "system", description: "", engine: :decidim_awesome)
        Decidim.icons.register(name: "fire", icon: "fire-line", category: "system", description: "", engine: :decidim_awesome)
        Decidim.icons.register(name: "line-chart-line", icon: "line-chart-line", category: "system", description: "", engine: :decidim_awesome)
        Decidim.icons.register(name: "spy", icon: "spy-fill", category: "system", description: "", engine: :decidim_awesome)
        Decidim.icons.register(name: "file-settings-line", icon: "file-settings-line", category: "system", description: "", engine: :decidim_awesome)
        Decidim.icons.register(name: "hashtag", icon: "hashtag", category: "system", description: "", engine: :decidim_awesome)
        Decidim.icons.register(name: "smartphone", icon: "smartphone-line", category: "system", description: "", engine: :decidim_awesome)
      end
    end
  end
end
