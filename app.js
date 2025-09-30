// app.js - Certificate Validation DApp - Complete Implementation with Enhanced Features

// ==================== CONFIGURATION ====================
window.CONTRACT_ADDRESS = "0xcc8a9a1d20ba4da17130be63ff12a74229d11fa8";
window.CONTRACT_ABI = [
  {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"isAdmin","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getAllAdminInfo","outputs":[{"internalType":"uint256","name":"totalAdmins","type":"uint256"},{"internalType":"bool","name":"isCallerAdmin","type":"bool"},{"internalType":"bool","name":"isCallerOwner","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"string","name":"certId","type":"string"}],"name":"getCertificate","outputs":[{"internalType":"string","name":"productName","type":"string"},{"internalType":"string","name":"mfgName","type":"string"},{"internalType":"uint256","name":"mfgDate","type":"uint256"},{"internalType":"bool","name":"isValid","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"string","name":"certId","type":"string"},{"internalType":"string","name":"productName","type":"string"},{"internalType":"string","name":"mfgName","type":"string"},{"internalType":"uint256","name":"mfgDate","type":"uint256"}],"name":"issueCertificate","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"string","name":"certId","type":"string"}],"name":"revokeCertificate","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"newAdmin","type":"address"}],"name":"addAdmin","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"adminToRemove","type":"address"}],"name":"removeAdmin","outputs":[],"stateMutability":"nonpayable","type":"function"}
];

const PUBLIC_RPC_URL = "https://1rpc.io/sepolia";
const TARGET_CHAIN_ID = 11155111; // Sepolia testnet

// ==================== GLOBAL STATE ====================
let publicProvider;
let walletProvider;
let signer;
let publicContract;
let walletContract;
let userAccount;
let qrScanner = null;
let videoStream = null;

// ==================== INITIALIZATION ====================
window.addEventListener('load', async () => {
  console.log('Certificate DApp initializing...');
  
  if (typeof ethers === 'undefined') {
    updateNetworkInfo('Ethers.js library not loaded. Please refresh the page.', 'error');
    return;
  }
  
  await initPublicProvider();
  setupWalletButtons();
  setupVerifyButton();
  setupManufacturerButtons();
  setupAdminManagementButtons();
  setupTransferButtons();
  setupQRScanner();
  setupQRUpload();
  
  // Check for existing wallet connection
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts && accounts.length > 0) {
        await connectWallet();
      }
    } catch (err) {
      console.warn('Could not check existing connection:', err);
    }
  }
});

// ==================== PROVIDER INITIALIZATION ====================
async function initPublicProvider() {
  try {
    publicProvider = new ethers.providers.JsonRpcProvider(PUBLIC_RPC_URL);
    const network = await publicProvider.getNetwork();
    publicContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, publicProvider);
    
    const code = await publicProvider.getCode(CONTRACT_ADDRESS);
    if (code === '0x') {
      updateNetworkInfo('Contract not found at specified address', 'error');
      return;
    }
    
    updateNetworkInfo(`Connected to ${network.name} (Chain ID: ${network.chainId})`, 'success');
    console.log('Public provider initialized successfully');
  } catch (err) {
    console.error('Provider initialization error:', err);
    updateNetworkInfo('Error connecting to blockchain: ' + err.message, 'error');
  }
}

// ==================== WALLET CONNECTION ====================
async function connectWallet() {
  if (!window.ethereum) {
    showStatus('connectionStatus', 'MetaMask not installed. Download from metamask.io', 'error');
    return;
  }
  
  try {
    showLoading('issueLoading', true);
    showLoading('transferLoading', true);
    
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found');
    }
    
    walletProvider = new ethers.providers.Web3Provider(window.ethereum);
    let network = await walletProvider.getNetwork();
    
    // Switch to Sepolia if on wrong network
    if (network.chainId !== TARGET_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${TARGET_CHAIN_ID.toString(16)}` }]
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        walletProvider = new ethers.providers.Web3Provider(window.ethereum);
        network = await walletProvider.getNetwork();
        
        if (network.chainId !== TARGET_CHAIN_ID) {
          throw new Error('Failed to switch network');
        }
      } catch (switchError) {
        if (switchError.code === 4902) {
          showStatus('connectionStatus', 'Please add Sepolia network to MetaMask', 'error');
        } else {
          showStatus('connectionStatus', 'Please switch to Sepolia network in MetaMask', 'error');
        }
        showLoading('issueLoading', false);
        showLoading('transferLoading', false);
        return;
      }
    }
    
    signer = walletProvider.getSigner();
    userAccount = await signer.getAddress();
    walletContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    
    await updateConnectionStatus();
    await checkAdminStatus();
    
    const connectBtn = document.getElementById('connectWallet');
    if (connectBtn) connectBtn.style.display = 'none';
    
    const manufacturerControls = document.getElementById('manufacturerControls');
    if (manufacturerControls) manufacturerControls.style.display = 'block';
    
    const transferSection = document.getElementById('transferSection');
    if (transferSection) transferSection.style.display = 'block';
    
    const statusControls = document.getElementById('adminStatusControls');
    if (statusControls) statusControls.style.display = 'block';
    
    showLoading('issueLoading', false);
    showLoading('transferLoading', false);
    console.log('Wallet connected:', userAccount);
    
  } catch (err) {
    console.error('Wallet connection error:', err);
    showStatus('connectionStatus', 'Connection failed: ' + err.message, 'error');
    showLoading('issueLoading', false);
    showLoading('transferLoading', false);
  }
}

async function updateConnectionStatus() {
  if (!walletProvider || !userAccount) return;
  
  try {
    const network = await walletProvider.getNetwork();
    const balance = await walletProvider.getBalance(userAccount);
    const ethBalance = ethers.utils.formatEther(balance);
    
    showStatus('connectionStatus', `
      <strong>Connected</strong><br>
      Account: ${userAccount.slice(0,6)}...${userAccount.slice(-4)}<br>
      Network: ${network.name} (Chain ID: ${network.chainId})<br>
      Balance: ${parseFloat(ethBalance).toFixed(4)} ETH
    `, 'success');
  } catch (err) {
    console.error('Status update error:', err);
  }
}

// ==================== PERMISSION CHECKS ====================
async function checkAdminStatus(forceRefresh = false) {
  if (!walletContract) return;
  
  try {
    if (forceRefresh) {
      showStatus('connectionStatus', 'Refreshing permissions...', 'info');
    }
    
    const adminInfo = await walletContract.getAllAdminInfo();
    const totalAdmins = adminInfo[0].toNumber();
    const isCallerAdmin = adminInfo[1];
    const isCallerOwner = adminInfo[2];
    
    const issueBtn = document.getElementById('issueCertBtn');
    if (issueBtn) issueBtn.disabled = !isCallerAdmin;
    
    // Show/hide admin management section based on owner status
    const adminSection = document.querySelector('.section:has(#adminList)');
    if (adminSection) {
      adminSection.style.display = isCallerOwner ? 'block' : 'none';
    }
    
    if (isCallerOwner) {
      showStatus('connectionStatus', 'You are the owner - full access granted', 'success');
      await loadAdminList();
    } else if (isCallerAdmin) {
      showStatus('connectionStatus', 'You are an authorized manufacturer - can issue and revoke certificates', 'success');
    } else {
      showStatus('connectionStatus', 'Connected - can transfer certificates', 'info');
    }
    
    console.log('Admin status:', { totalAdmins, isCallerAdmin, isCallerOwner });
    
  } catch (err) {
    console.error('Admin check error:', err);
    showStatus('connectionStatus', 'Error checking permissions: ' + err.message, 'error');
  }
}

async function loadAdminList() {
  if (!walletContract) return;
  
  try {
    const info = await walletContract.getAllAdminInfo();
    const totalAdmins = info[0].toNumber();
    const ownerAddr = await walletContract.owner();
    
    const listEl = document.getElementById('adminList');
    if (listEl) {
      listEl.innerHTML = `
        <strong>Manufacturer Information:</strong><br>
        Total Authorized Manufacturers: ${totalAdmins}<br>
        Contract Owner: ${ownerAddr}<br>
        <small>Use "Check Authorization Status" to verify specific addresses</small>
      `;
      listEl.className = 'status info';
    }
  } catch (err) {
    console.error('Load admin list error:', err);
    const listEl = document.getElementById('adminList');
    if (listEl) {
      listEl.innerHTML = '<span class="error">Error loading manufacturer info</span>';
    }
  }
}

// ==================== CERTIFICATE VERIFICATION ====================
async function verifyCert() {
  const input = document.getElementById('verifyCertId');
  const certId = input ? input.value.trim() : '';
  
  if (!certId) {
    showVerificationResult('Please enter a certificate ID', 'error');
    return;
  }
  
  if (!publicContract) {
    showVerificationResult('Blockchain connection not available. Please refresh the page.', 'error');
    return;
  }
  
  try {
    showLoading('verifyLoading', true);
    console.log('Verifying certificate:', certId);
    
    // Parse certificate data if it contains JSON
    let parsedData = null;
    try {
      parsedData = JSON.parse(certId);
    } catch (e) {
      // Not JSON, treat as regular cert ID
    }
    
    const actualCertId = parsedData ? parsedData.certId : certId;
    
    const result = await publicContract.getCertificate(actualCertId);
    const [productName, mfgName, mfgDateBN, isValid] = result;
    const mfgDateNum = mfgDateBN.toNumber();
    
    if (!productName && mfgDateNum === 0) {
      showVerificationResult(`
        <h4>Certificate Not Found</h4>
        <p>No certificate found with ID: <strong>${actualCertId}</strong></p>
        <p>Please check the ID and try again.</p>
      `, 'error');
    } else {
      const dateStr = mfgDateNum ? new Date(mfgDateNum * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }) : 'Not specified';
      
      let detailsHtml = `
        <div class="certificate-details">
          <h4>Certificate Verification Result</h4>
          <div class="detail-row">
            <span class="detail-label">Certificate ID:</span>
            <span class="detail-value">${actualCertId}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Status:</span>
            <span class="detail-value" style="color: ${isValid ? '#00ff88' : '#ff6b6b'}; font-weight: bold;">
              ${isValid ? '✓ VALID' : '✗ REVOKED/INVALID'}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Product Name:</span>
            <span class="detail-value">${productName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Manufacturer:</span>
            <span class="detail-value">${mfgName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Manufacturing Date:</span>
            <span class="detail-value">${dateStr}</span>
          </div>`;
      
      // Add extra details if available from QR code
      if (parsedData) {
        if (parsedData.location) {
          detailsHtml += `
          <div class="detail-row">
            <span class="detail-label">Manufacturing Location:</span>
            <span class="detail-value">${parsedData.location}</span>
          </div>`;
        }
        if (parsedData.intendedRegion) {
          detailsHtml += `
          <div class="detail-row">
            <span class="detail-label">Intended Region of Sale:</span>
            <span class="detail-value">${parsedData.intendedRegion}</span>
          </div>`;
        }
        if (parsedData.details) {
          detailsHtml += `
          <div class="detail-row">
            <span class="detail-label">Product Details:</span>
            <span class="detail-value">${parsedData.details}</span>
          </div>`;
        }
        if (parsedData.notes) {
          detailsHtml += `
          <div class="detail-row">
            <span class="detail-label">Additional Notes:</span>
            <span class="detail-value">${parsedData.notes}</span>
          </div>`;
        }
      }
      
      detailsHtml += '</div>';
      
      showVerificationResult(detailsHtml, isValid ? 'success' : 'error');
    }
    
    showLoading('verifyLoading', false);
    
  } catch (err) {
    console.error('Verification error:', err);
    showVerificationResult('Verification failed: ' + err.message, 'error');
    showLoading('verifyLoading', false);
  }
}

// ==================== CERTIFICATE ISSUANCE ====================
async function issueCert() {
  const productName = document.getElementById('productName')?.value.trim();
  const mfgDate = document.getElementById('mfgDate')?.value.trim();
  const location = document.getElementById('location')?.value.trim();
  const intendedRegion = document.getElementById('intendedRegion')?.value.trim();
  const details = document.getElementById('details')?.value.trim() || '';
  const notes = document.getElementById('notes')?.value.trim() || '';
  
  if (!productName || !mfgDate || !location || !intendedRegion) {
    showStatus('connectionStatus', 'Please fill in all required fields', 'error');
    return;
  }
  
  if (!walletContract) {
    showStatus('connectionStatus', 'Please connect your wallet first', 'error');
    return;
  }
  
  try {
    showLoading('issueLoading', true);
    
    const timestamp = Math.floor(new Date(mfgDate).getTime() / 1000);
    
    if (isNaN(timestamp) || timestamp <= 0) {
      showStatus('connectionStatus', 'Invalid date format', 'error');
      showLoading('issueLoading', false);
      return;
    }
    
    // Generate unique certificate ID
    const certId = generateCertId();
    
    // Create comprehensive certificate data for QR code
    const certData = {
      certId: certId,
      productName: productName,
      location: location,
      intendedRegion: intendedRegion,
      details: details,
      notes: notes,
      mfgDate: mfgDate
    };
    
    console.log('Issuing certificate:', certId);
    showStatus('connectionStatus', 'Preparing transaction...', 'info');
    
    // Store basic info on blockchain (productName will serve as combined info)
    const blockchainData = JSON.stringify({
      name: productName,
      location: location,
      region: intendedRegion
    });
    
    const tx = await walletContract.issueCertificate(certId, blockchainData, location, timestamp);
    showStatus('connectionStatus', 'Transaction submitted. Waiting for confirmation...', 'info');
    
    const receipt = await tx.wait();
    console.log('Transaction confirmed:', receipt.transactionHash);
    
    showStatus('connectionStatus', `Certificate issued successfully!<br>TX: ${receipt.transactionHash.slice(0,10)}...`, 'success');
    
    // Generate and display QR code
    await generateQRCode(JSON.stringify(certData), certId);
    
    // Clear form
    document.getElementById('productName').value = '';
    document.getElementById('mfgDate').value = '';
    document.getElementById('location').value = '';
    document.getElementById('intendedRegion').value = '';
    document.getElementById('details').value = '';
    document.getElementById('notes').value = '';
    
    showLoading('issueLoading', false);
    
  } catch (err) {
    console.error('Issue certificate error:', err);
    let errorMsg = err.message;
    
    if (err.reason) errorMsg = err.reason;
    if (errorMsg.includes('user rejected')) errorMsg = 'Transaction rejected by user';
    if (errorMsg.includes('already exists')) errorMsg = 'Certificate ID already exists';
    
    showStatus('connectionStatus', 'Failed to issue certificate: ' + errorMsg, 'error');
    showLoading('issueLoading', false);
  }
}

function generateCertId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `CERT-${timestamp}-${random}`.toUpperCase();
}

async function generateQRCode(data, certId) {
  const canvas = document.getElementById('qrCodeCanvas');
  const display = document.getElementById('qrDisplay');
  const certIdSpan = document.getElementById('generatedCertId');
  
  if (!canvas || !display) return;
  
  try {
    if (typeof QRCode !== 'undefined') {
      await QRCode.toCanvas(canvas, data, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      if (certIdSpan) certIdSpan.textContent = certId;
      display.style.display = 'block';
      
      // Scroll to QR code
      display.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      console.error('QRCode library not loaded');
      showStatus('connectionStatus', 'QR code generation unavailable', 'warning');
    }
  } catch (err) {
    console.error('QR generation error:', err);
    showStatus('connectionStatus', 'Error generating QR code: ' + err.message, 'error');
  }
}

// ==================== QR CODE ACTIONS ====================
window.downloadQR = function() {
  const canvas = document.getElementById('qrCodeCanvas');
  const certId = document.getElementById('generatedCertId')?.textContent || 'certificate';
  
  if (canvas) {
    const link = document.createElement('a');
    link.download = `${certId}_QRCode.png`;
    link.href = canvas.toDataURL();
    link.click();
  }
};

window.printQR = function() {
  const canvas = document.getElementById('qrCodeCanvas');
  const certId = document.getElementById('generatedCertId')?.textContent || 'Certificate';
  
  if (canvas) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Certificate QR Code</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 20px;
            }
            h2 { margin-bottom: 10px; }
            p { margin: 5px 0; }
            img { margin: 20px 0; }
          </style>
        </head>
        <body>
          <h2>Certificate QR Code</h2>
          <p><strong>Certificate ID:</strong> ${certId}</p>
          <img src="${canvas.toDataURL()}" />
          <p>Scan to verify product authenticity</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }
};

// ==================== CERTIFICATE REVOCATION ====================
async function revokeCert() {
  const certId = document.getElementById('revokeCertId')?.value.trim();
  
  if (!certId) {
    showStatus('connectionStatus', 'Please enter a certificate ID to revoke', 'error');
    return;
  }
  
  if (!walletContract) {
    showStatus('connectionStatus', 'Please connect your wallet first', 'error');
    return;
  }
  
  try {
    showLoading('issueLoading', true);
    console.log('Revoking certificate:', certId);
    
    showStatus('connectionStatus', 'Sending revocation transaction...', 'info');
    
    const tx = await walletContract.revokeCertificate(certId);
    showStatus('connectionStatus', 'Waiting for confirmation...', 'info');
    
    const receipt = await tx.wait();
    console.log('Revocation confirmed:', receipt.transactionHash);
    
    showStatus('connectionStatus', `Certificate revoked!<br>TX: ${receipt.transactionHash.slice(0,10)}...`, 'success');
    document.getElementById('revokeCertId').value = '';
    
    showLoading('issueLoading', false);
    
  } catch (err) {
    console.error('Revoke certificate error:', err);
    let errorMsg = err.message;
    
    if (err.reason) errorMsg = err.reason;
    if (errorMsg.includes('user rejected')) errorMsg = 'Transaction rejected by user';
    if (errorMsg.includes('not found')) errorMsg = 'Certificate not found';
    
    showStatus('connectionStatus', 'Failed to revoke: ' + errorMsg, 'error');
    showLoading('issueLoading', false);
  }
}

// ==================== ADMIN MANAGEMENT ====================
async function addNewAdmin() {
  const addr = document.getElementById('newAdminAddress')?.value.trim();
  
  if (!addr || !ethers.utils.isAddress(addr)) {
    showStatus('connectionStatus', 'Please enter a valid Ethereum address', 'error');
    return;
  }
  
  if (!walletContract) {
    showStatus('connectionStatus', 'Connect wallet first', 'error');
    return;
  }
  
  try {
    showLoading('adminLoading', true);
    console.log('Adding manufacturer:', addr);
    
    const tx = await walletContract.addAdmin(addr);
    showStatus('connectionStatus', 'Adding manufacturer...', 'info');
    
    await tx.wait();
    showStatus('connectionStatus', 'Manufacturer added successfully!', 'success');
    
    document.getElementById('newAdminAddress').value = '';
    await loadAdminList();
    
    showLoading('adminLoading', false);
    
  } catch (err) {
    console.error('Add admin error:', err);
    let errorMsg = err.reason || err.message;
    if (errorMsg.includes('already admin')) errorMsg = 'Address is already a manufacturer';
    
    showStatus('connectionStatus', 'Failed to add manufacturer: ' + errorMsg, 'error');
    showLoading('adminLoading', false);
  }
}

async function removeAdmin() {
  const addr = document.getElementById('removeAdminAddress')?.value.trim();
  
  if (!addr || !ethers.utils.isAddress(addr)) {
    showStatus('connectionStatus', 'Please enter a valid Ethereum address', 'error');
    return;
  }
  
  if (!walletContract) {
    showStatus('connectionStatus', 'Connect wallet first', 'error');
    return;
  }
  
  try {
    showLoading('adminLoading', true);
    console.log('Removing manufacturer:', addr);
    
    const tx = await walletContract.removeAdmin(addr);
    showStatus('connectionStatus', 'Removing manufacturer...', 'info');
    
    await tx.wait();
    showStatus('connectionStatus', 'Manufacturer removed successfully!', 'success');
    
    document.getElementById('removeAdminAddress').value = '';
    await loadAdminList();
    
    showLoading('adminLoading', false);
    
  } catch (err) {
    console.error('Remove admin error:', err);
    let errorMsg = err.reason || err.message;
    if (errorMsg.includes('not admin')) errorMsg = 'Address is not a manufacturer';
    
    showStatus('connectionStatus', 'Failed to remove manufacturer: ' + errorMsg, 'error');
    showLoading('adminLoading', false);
  }
}

async function checkSpecificAdmin() {
  const addr = document.getElementById('checkAdminAddress')?.value.trim();
  const resultEl = document.getElementById('adminCheckResult');
  
  if (!resultEl) return;
  
  if (!addr || !ethers.utils.isAddress(addr)) {
    resultEl.innerHTML = '<div class="status error">Please enter a valid Ethereum address</div>';
    return;
  }
  
  try {
    showLoading('adminLoading', true);
    console.log('Checking authorization status:', addr);
    
    const isAdmin = await publicContract.isAdmin(addr);
    const owner = await publicContract.owner();
    const isOwner = addr.toLowerCase() === owner.toLowerCase();
    
    let statusText = '';
    let statusClass = '';
    
    if (isOwner) {
      statusText = 'Owner (has manufacturer rights)';
      statusClass = 'success';
    } else if (isAdmin) {
      statusText = 'Authorized Manufacturer';
      statusClass = 'success';
    } else {
      statusText = 'Not authorized as manufacturer';
      statusClass = 'info';
    }
    
    resultEl.innerHTML = `
      <div class="status ${statusClass}">
        <strong>Address:</strong> ${addr}<br>
        <strong>Status:</strong> ${statusText}<br>
        <strong>Contract Owner:</strong> ${owner}
      </div>
    `;
    
    showLoading('adminLoading', false);
    
  } catch (err) {
    console.error('Check admin error:', err);
    resultEl.innerHTML = '<div class="status error">Error checking status: ' + err.message + '</div>';
    showLoading('adminLoading', false);
  }
}

// ==================== CERTIFICATE TRANSFER ====================
async function transferCert() {
  const certId = document.getElementById('transferCertId')?.value.trim();
  const recipient = document.getElementById('recipientAddress')?.value.trim();
  
  if (!certId) {
    showTransferResult('Please enter a certificate ID', 'error');
    return;
  }
  
  if (!recipient || !ethers.utils.isAddress(recipient)) {
    showTransferResult('Please enter a valid recipient address', 'error');
    return;
  }
  
  if (!walletContract) {
    showTransferResult('Please connect your wallet first', 'error');
    return;
  }
  
  try {
    showLoading('transferLoading', true);
    console.log('Transferring certificate:', certId, 'to', recipient);
    
    showTransferResult('Preparing transfer transaction...', 'info');
    
    // Note: This requires a transfer function in the smart contract
    // For now, we'll show a placeholder message
    showTransferResult(`
      <h4>Transfer Feature</h4>
      <p>Certificate transfer functionality requires additional smart contract methods.</p>
      <p><strong>Certificate ID:</strong> ${certId}</p>
      <p><strong>Recipient:</strong> ${recipient}</p>
      <p>Please contact the contract owner to implement transfer functionality.</p>
    `, 'info');
    
    showLoading('transferLoading', false);
    
  } catch (err) {
    console.error('Transfer error:', err);
    showTransferResult('Transfer failed: ' + err.message, 'error');
    showLoading('transferLoading', false);
  }
}

// ==================== QR CODE SCANNER ====================
function setupQRScanner() {
  const scanBtn = document.getElementById('scanQRButton');
  if (!scanBtn) return;
  
  scanBtn.addEventListener('click', toggleQRScanner);
}

async function toggleQRScanner() {
  if (videoStream) {
    stopQRScanner();
  } else {
    await startQRScanner();
  }
}

async function startQRScanner() {
  const video = document.getElementById('qrVideo');
  if (!video) {
    console.warn('QR video element not found');
    return;
  }
  
  try {
    console.log('Starting QR scanner...');
    
    videoStream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } 
    });
    
    video.srcObject = videoStream;
    video.style.display = 'block';
    await video.play();
    
    const scanBtn = document.getElementById('scanQRButton');
    if (scanBtn) scanBtn.textContent = 'Stop Scanning';
    
    // Initialize ZXing scanner if available
    if (window.ZXing) {
      const codeReader = new ZXing.BrowserQRCodeReader();
      
      codeReader.decodeFromVideoDevice(null, 'qrVideo', (result, err) => {
        if (result) {
          console.log('QR Code detected:', result.text);
          
          const input = document.getElementById('verifyCertId');
          if (input) {
            input.value = result.text;
          }
          
          stopQRScanner();
          verifyCert();
        }
        
        if (err && !(err instanceof ZXing.NotFoundException)) {
          console.error('QR scan error:', err);
        }
      });
      
      qrScanner = codeReader;
      console.log('QR scanner initialized');
    } else {
      console.error('ZXing library not loaded');
      showVerificationResult('QR scanner library not loaded. Please refresh the page.', 'error');
      stopQRScanner();
    }
    
  } catch (err) {
    console.error('Camera access error:', err);
    
    let errorMsg = 'Camera access denied or unavailable';
    if (err.name === 'NotAllowedError') {
      errorMsg = 'Camera permission denied. Please allow camera access and try again.';
    } else if (err.name === 'NotFoundError') {
      errorMsg = 'No camera found on this device.';
    } else if (err.name === 'NotReadableError') {
      errorMsg = 'Camera is already in use by another application.';
    }
    
    showVerificationResult(errorMsg, 'error');
  }
}

function stopQRScanner() {
  console.log('Stopping QR scanner...');
  
  if (videoStream) {
    videoStream.getTracks().forEach(track => {
      track.stop();
      console.log('Camera track stopped');
    });
    videoStream = null;
  }
  
  if (qrScanner) {
    qrScanner.reset();
    qrScanner = null;
  }
  
  const video = document.getElementById('qrVideo');
  if (video) {
    video.style.display = 'none';
    video.srcObject = null;
  }
  
  const scanBtn = document.getElementById('scanQRButton');
  if (scanBtn) scanBtn.textContent = 'Scan QR Code';
}

// ==================== QR CODE UPLOAD ====================
function setupQRUpload() {
  const uploadBtn = document.getElementById('uploadQRBtn');
  if (!uploadBtn) return;
  
  uploadBtn.addEventListener('click', handleQRUpload);
}

async function handleQRUpload() {
  const fileInput = document.getElementById('qrUpload');
  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    showVerificationResult('Please select an image file', 'error');
    return;
  }
  
  const file = fileInput.files[0];
  
  try {
    showLoading('verifyLoading', true);
    
    const imageData = await readImageFile(file);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    
    if (code) {
      console.log('QR Code detected from image:', code.data);
      
      const input = document.getElementById('verifyCertId');
      if (input) {
        input.value = code.data;
      }
      
      await verifyCert();
    } else {
      showVerificationResult('No QR code found in the image. Please try another image.', 'error');
      showLoading('verifyLoading', false);
    }
    
  } catch (err) {
    console.error('QR upload error:', err);
    showVerificationResult('Error reading QR code from image: ' + err.message, 'error');
    showLoading('verifyLoading', false);
  }
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const img = new Image();
      
      img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve(imageData);
      };
      
      img.onerror = function() {
        reject(new Error('Failed to load image'));
      };
      
      img.src = e.target.result;
    };
    
    reader.onerror = function() {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsDataURL(file);
  });
}

// ==================== EVENT HANDLERS ====================
function setupWalletButtons() {
  const connectBtn = document.getElementById('connectWallet');
  if (connectBtn) {
    connectBtn.addEventListener('click', connectWallet);
  }
  
  const refreshBtn = document.getElementById('refreshAdminStatus');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => checkAdminStatus(true));
  }
  
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);
  }
}

function setupVerifyButton() {
  const verifyBtn = document.getElementById('verifyCertBtn');
  if (verifyBtn) {
    verifyBtn.addEventListener('click', verifyCert);
  }
  
  const input = document.getElementById('verifyCertId');
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        verifyCert();
      }
    });
  }
}

function setupManufacturerButtons() {
  const issueBtn = document.getElementById('issueCertBtn');
  if (issueBtn) {
    issueBtn.addEventListener('click', issueCert);
  }
  
  const revokeBtn = document.getElementById('revokeCertBtn');
  if (revokeBtn) {
    revokeBtn.addEventListener('click', revokeCert);
  }
}

function setupAdminManagementButtons() {
  const addBtn = document.getElementById('addAdminBtn');
  if (addBtn) {
    addBtn.addEventListener('click', addNewAdmin);
  }
  
  const removeBtn = document.getElementById('removeAdminBtn');
  if (removeBtn) {
    removeBtn.addEventListener('click', removeAdmin);
  }
  
  const checkBtn = document.getElementById('checkAdminBtn');
  if (checkBtn) {
    checkBtn.addEventListener('click', checkSpecificAdmin);
  }
}

function setupTransferButtons() {
  const transferBtn = document.getElementById('transferCertBtn');
  if (transferBtn) {
    transferBtn.addEventListener('click', transferCert);
  }
}

function handleAccountsChanged(accounts) {
  console.log('Accounts changed:', accounts);
  
  if (!accounts || accounts.length === 0) {
    userAccount = null;
    walletContract = null;
    
    showStatus('connectionStatus', 'Wallet disconnected. Please connect to continue.', 'warning');
    
    const connectBtn = document.getElementById('connectWallet');
    if (connectBtn) connectBtn.style.display = 'block';
    
    const manufacturerControls = document.getElementById('manufacturerControls');
    if (manufacturerControls) manufacturerControls.style.display = 'none';
    
    const transferSection = document.getElementById('transferSection');
    if (transferSection) transferSection.style.display = 'none';
    
    const statusControls = document.getElementById('adminStatusControls');
    if (statusControls) statusControls.style.display = 'none';
  } else {
    connectWallet();
  }
}

function handleChainChanged(chainId) {
  console.log('Chain changed:', chainId);
  showStatus('connectionStatus', 'Network changed. Reloading page...', 'info');
  setTimeout(() => window.location.reload(), 1500);
}

// ==================== UI HELPER FUNCTIONS ====================
function updateNetworkInfo(msg, type = '') {
  const el = document.getElementById('networkInfo');
  if (el) {
    el.innerHTML = '<strong>Network:</strong> ' + msg;
    el.className = `network-info ${type}`;
  }
}

function showStatus(elementId, msg, type = '') {
  const el = document.getElementById(elementId);
  if (el) {
    el.innerHTML = msg;
    el.className = `status ${type}`;
  }
}

function showVerificationResult(msg, type = '') {
  const el = document.getElementById('verificationResult');
  if (el) {
    el.innerHTML = `<div class="status ${type}">${msg}</div>`;
  }
}

function showTransferResult(msg, type = '') {
  const el = document.getElementById('transferResult');
  if (el) {
    el.innerHTML = `<div class="status ${type}">${msg}</div>`;
  }
}

function showLoading(elementId, show) {
  const el = document.getElementById(elementId);
  if (el) {
    el.style.display = show ? 'block' : 'none';
  }
}

// ==================== EXPORTS FOR CONSOLE DEBUGGING ====================
window.verifyCert = verifyCert;
window.connectWallet = connectWallet;
window.checkAdminStatus = checkAdminStatus;
window.issueCert = issueCert;
window.revokeCert = revokeCert;
window.transferCert = transferCert;

console.log('Certificate DApp loaded. Available functions:', {
  verifyCert: 'Verify a certificate',
  connectWallet: 'Connect MetaMask',
  checkAdminStatus: 'Check authorization permissions',
  issueCert: 'Issue new certificate (manufacturer only)',
  revokeCert: 'Revoke certificate (manufacturer only)',
  transferCert: 'Transfer certificate ownership'
});