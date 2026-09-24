package com.nexonai.unpruuf.screens.home

import androidx.lifecycle.ViewModel
import com.nexonai.unpruuf.domain.network.TorManager
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    torManager: TorManager
) : ViewModel() {
    val isTorReady = torManager.isReady
    val onionAddress = torManager.onionAddress
}
