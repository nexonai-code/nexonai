package com.nexonai.unpruuf.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.nexonai.unpruuf.screens.chat.ChatScreen
import com.nexonai.unpruuf.screens.contactdetail.ContactDetailScreen
import com.nexonai.unpruuf.screens.contacts.ContactsScreen
import com.nexonai.unpruuf.screens.home.HomeScreen
import com.nexonai.unpruuf.screens.home.HomeViewModel
import com.nexonai.unpruuf.screens.qrpair.QrPairScreen
import com.nexonai.unpruuf.screens.settings.SettingsScreen

object Routes {
    const val HOME = "home"
    const val CONTACTS = "contacts"
    const val CHAT = "chat/{contactId}"
    const val QR_PAIR = "qr_pair"
    const val SETTINGS = "settings"
    const val CONTACT_DETAIL = "contact_detail/{contactId}"

    fun chatRoute(contactId: String) = "chat/$contactId"
    fun contactDetailRoute(contactId: String) = "contact_detail/$contactId"
}

@Composable
fun AppNavigation(
    deepLinkContactId: String? = null,
    onDeepLinkConsumed: () -> Unit = {}
) {
    val navController = rememberNavController()

    // Navigate to chat when app is opened via notification tap
    LaunchedEffect(deepLinkContactId) {
        if (deepLinkContactId != null) {
            navController.navigate(Routes.chatRoute(deepLinkContactId)) {
                launchSingleTop = true
            }
            onDeepLinkConsumed()
        }
    }

    // Contacts is the start screen. The former home/status screen is now
    // reachable from Settings ("Network & security status").
    NavHost(navController = navController, startDestination = Routes.CONTACTS) {
        composable(Routes.CONTACTS) {
            ContactsScreen(
                onContactClick = { contact ->
                    navController.navigate(Routes.chatRoute(contact.id))
                },
                onAddContact = { navController.navigate(Routes.QR_PAIR) },
                onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                onVerifyContact = { contact ->
                    navController.navigate(Routes.contactDetailRoute(contact.id))
                }
            )
        }
        composable(Routes.HOME) {
            val homeViewModel: HomeViewModel = hiltViewModel()
            val isTorReady by homeViewModel.isTorReady.collectAsState()
            HomeScreen(
                onNavigateBack = { navController.popBackStack() },
                isTorConnected = isTorReady
            )
        }
        composable(
            route = Routes.CHAT,
            arguments = listOf(navArgument("contactId") { type = NavType.StringType })
        ) { backStack ->
            val contactId = backStack.arguments?.getString("contactId") ?: return@composable
            ChatScreen(
                contactId = contactId,
                onNavigateBack = { navController.popBackStack() },
                onNavigateToSettings = { navController.navigate(Routes.SETTINGS) }
            )
        }
        composable(Routes.QR_PAIR) {
            QrPairScreen(onNavigateBack = { navController.popBackStack() })
        }
        composable(
            route = Routes.CONTACT_DETAIL,
            arguments = listOf(navArgument("contactId") { type = NavType.StringType })
        ) { backStack ->
            val contactId = backStack.arguments?.getString("contactId") ?: return@composable
            ContactDetailScreen(
                contactId = contactId,
                onNavigateBack = { navController.popBackStack() }
            )
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToInfo = { navController.navigate(Routes.HOME) }
            )
        }
    }
}
