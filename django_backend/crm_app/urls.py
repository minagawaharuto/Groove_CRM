from django.urls import path
from . import views, api_views

urlpatterns = [
    path('', views.index, name='index'),
    
    # API Endpoints
    path('api/getCurrentUser', api_views.get_current_user, name='api_get_current_user'),
    path('api/searchPeople', api_views.search_people, name='api_search_people'),
    path('api/getPerson', api_views.get_person, name='api_get_person'),
    path('api/updatePerson', api_views.update_person, name='api_update_person'),
    path('api/createPerson', api_views.create_person, name='api_create_person'),
    path('api/getPersonTimeline', api_views.get_person_timeline, name='api_get_person_timeline'),
    path('api/addActivityLog', api_views.add_activity_log, name='api_add_activity_log'),
    path('api/listDeals', api_views.list_deals, name='api_list_deals'),
    path('api/getDeal', api_views.get_deal, name='api_get_deal'),
    path('api/createDeal', api_views.create_deal, name='api_create_deal'),
    path('api/autoEnrichPerson', api_views.auto_enrich_person, name='api_auto_enrich_person'),
    path('api/aiSearchPeople', api_views.ai_search_people, name='api_ai_search_people'),
]
